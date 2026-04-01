import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import {
  InvoiceStatus,
  PaymentProvider,
  PaymentTransactionStatus,
  UserRole,
} from '@prisma/client';
import { JwtPayload } from '../auth/types';

function isZeroDecimalCurrency(currency: string): boolean {
  // Minimal list (extend as needed)
  return ['xof', 'xaf', 'jpy', 'krw', 'vnd'].includes(currency.toLowerCase());
}

function toProviderAmount(amount: number, currency: string): number {
  if (amount < 0) return 0;
  if (isZeroDecimalCurrency(currency)) return Math.round(amount);
  return Math.round(amount * 100);
}

@Injectable()
export class BillingService {
  private stripe?: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const secret = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secret) {
      this.stripe = new Stripe(secret);
    }
  }

  private async getInvoiceForPayment(invoiceId: number, user: JwtPayload) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        contract: {
          include: { property: true },
        },
        tenant: { include: { user: true } },
      },
    });

    if (!invoice) throw new NotFoundException(`Invoice with ID "${invoiceId}" not found.`);

    // RBAC
    if (user.role === UserRole.TENANT) {
      const tenantProfile = await this.prisma.tenant.findUnique({
        where: { userId: user.sub },
      });
      if (!tenantProfile || invoice.tenantId !== tenantProfile.id) {
        throw new ForbiddenException('You do not have permission to pay this invoice.');
      }
    } else if (user.role === UserRole.MANAGER) {
      const employeeProfile = await this.prisma.employee.findUnique({
        where: { userId: user.sub },
      });
      if (!employeeProfile || invoice.contract.managerId !== employeeProfile.id) {
        throw new ForbiddenException('You do not have permission to pay this invoice.');
      }
    } else if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You do not have permission to pay this invoice.');
    }

    return invoice;
  }

  async initiateStripePayment(invoiceId: number, user: JwtPayload) {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe is not configured (missing STRIPE_SECRET_KEY).');
    }

    const invoice = await this.getInvoiceForPayment(invoiceId, user);

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid.');
    }

    const amountToPay = Math.max(0, invoice.amountDue - invoice.paidAmount);
    if (amountToPay <= 0) {
      throw new BadRequestException('Nothing left to pay for this invoice.');
    }

    const currency = (this.configService.get<string>('PAYMENT_CURRENCY') || 'xof').toLowerCase();
    const providerAmount = toProviderAmount(amountToPay, currency);
    if (!Number.isFinite(providerAmount) || providerAmount <= 0) {
      throw new BadRequestException('Invalid payment amount.');
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: providerAmount,
      currency,
      metadata: { invoiceId: String(invoice.id) },
      description: `Invoice ${invoice.invoiceNumber}`,
      automatic_payment_methods: { enabled: true },
    });

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        invoiceId: invoice.id,
        provider: PaymentProvider.STRIPE,
        providerRef: paymentIntent.id,
        amount: amountToPay,
        status: PaymentTransactionStatus.PENDING,
        rawPayload: paymentIntent as any,
      },
    });

    return {
      invoiceId: invoice.id,
      provider: 'STRIPE',
      transactionId: transaction.id,
      clientSecret: paymentIntent.client_secret,
    };
  }

  async initiateMobileMoneyPayment(invoiceId: number, user: JwtPayload) {
    const invoice = await this.getInvoiceForPayment(invoiceId, user);

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid.');
    }

    const amountToPay = Math.max(0, invoice.amountDue - invoice.paidAmount);
    if (amountToPay <= 0) {
      throw new BadRequestException('Nothing left to pay for this invoice.');
    }

    // Stub providerRef for now; replace with real provider transaction IDs later.
    const providerRef = `mm_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        invoiceId: invoice.id,
        provider: PaymentProvider.MOBILE_MONEY,
        providerRef,
        amount: amountToPay,
        status: PaymentTransactionStatus.PENDING,
        rawPayload: { initiatedAt: new Date().toISOString() },
      },
    });

    return {
      invoiceId: invoice.id,
      provider: 'MOBILE_MONEY',
      transactionId: transaction.id,
      providerRef,
      // Placeholder - your real integration will return redirect/USSD/session details
      nextAction: { type: 'PENDING_PROVIDER_INTEGRATION' as const },
    };
  }

  async handleStripeWebhook(rawBody: Buffer | undefined, signature?: string) {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe is not configured (missing STRIPE_SECRET_KEY).');
    }

    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new InternalServerErrorException('Stripe webhook is not configured (missing STRIPE_WEBHOOK_SECRET).');
    }

    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing raw request body.');
    }
    if (!signature) {
      throw new ForbiddenException('Missing Stripe signature.');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error('Stripe webhook signature verification failed:', err?.message || err);
      throw new ForbiddenException('Invalid Stripe signature.');
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this.markStripeTransactionSucceeded(pi.id, event);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this.markStripeTransactionFailed(pi.id, event);
        break;
      }
      case 'payment_intent.canceled': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this.markStripeTransactionCancelled(pi.id, event);
        break;
      }
      default:
        // Ignore unhandled event types
        break;
    }

    return { received: true };
  }

  /**
   * Mobile money webhook handler (generic placeholder).
   * Expected payload shape (example):
   * {
   *   "providerRef": "mm_...",
   *   "status": "SUCCESS" | "FAILED" | "CANCELLED",
   *   "amount": 1234.56,
   *   ...any provider fields...
   * }
   */
  async handleMobileMoneyWebhook(payload: any) {
    const providerRef = payload?.providerRef;
    const status = payload?.status;

    if (!providerRef || typeof providerRef !== 'string') {
      throw new BadRequestException('Missing providerRef.');
    }

    if (
      status !== PaymentTransactionStatus.SUCCESS &&
      status !== PaymentTransactionStatus.FAILURE &&
      status !== PaymentTransactionStatus.CANCELLED
    ) {
      throw new BadRequestException('Invalid status.');
    }

    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: {
        provider: PaymentProvider.MOBILE_MONEY,
        providerRef,
      },
      include: { invoice: true },
    });
    if (!transaction) return { received: true };
    if (transaction.status === PaymentTransactionStatus.SUCCESS) return { received: true };

    if (status === PaymentTransactionStatus.SUCCESS) {
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status, rawPayload: payload as any },
        });

        const invoice = transaction.invoice;
        const newPaid = Math.min(invoice.amountDue, invoice.paidAmount + transaction.amount);
        const newStatus =
          newPaid >= invoice.amountDue ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaid,
            status: newStatus,
            paidDate: newStatus === InvoiceStatus.PAID ? new Date() : invoice.paidDate,
          },
        });
      });
    } else {
      await this.prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status, rawPayload: payload as any },
      });
    }

    return { received: true };
  }

  private async markStripeTransactionSucceeded(providerRef: string, rawEvent: Stripe.Event) {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { providerRef },
      include: { invoice: true },
    });
    if (!transaction) return;
    if (transaction.status === PaymentTransactionStatus.SUCCESS) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: PaymentTransactionStatus.SUCCESS,
          rawPayload: rawEvent as any,
        },
      });

      const invoice = transaction.invoice;
      const newPaid = Math.min(invoice.amountDue, invoice.paidAmount + transaction.amount);
      const newStatus =
        newPaid >= invoice.amountDue ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaid,
          status: newStatus,
          paidDate: newStatus === InvoiceStatus.PAID ? new Date() : invoice.paidDate,
        },
      });
    });
  }

  private async markStripeTransactionFailed(providerRef: string, rawEvent: Stripe.Event) {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { providerRef },
    });
    if (!transaction) return;
    if (transaction.status === PaymentTransactionStatus.SUCCESS) return;

    await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: PaymentTransactionStatus.FAILURE,
        rawPayload: rawEvent as any,
      },
    });
  }

  private async markStripeTransactionCancelled(providerRef: string, rawEvent: Stripe.Event) {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { providerRef },
    });
    if (!transaction) return;
    if (transaction.status === PaymentTransactionStatus.SUCCESS) return;

    await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: PaymentTransactionStatus.CANCELLED,
        rawPayload: rawEvent as any,
      },
    });
  }
}

