ALTER TABLE "users" ADD COLUMN "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "phoneVerifyCode" TEXT;
ALTER TABLE "users" ADD COLUMN "phoneVerifyExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "phoneOtpLastSentAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");
