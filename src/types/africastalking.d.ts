declare module 'africastalking' {
  type Credentials = {
    username: string;
    apiKey: string;
  };

  type SmsOptions = {
    to: string[];
    message: string;
    senderId?: string;
    enqueue?: boolean;
  };

  type AfricasTalkingClient = {
    SMS: {
      send(options: SmsOptions): Promise<unknown>;
    };
  };

  export default function AfricasTalking(
    credentials: Credentials,
  ): AfricasTalkingClient;
}
