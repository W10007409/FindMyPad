export type FcmCommand = { type: 'RING' | 'LOCATE_NOW' };
export interface FcmSender { send(token: string, cmd: FcmCommand): Promise<void>; }
export class StubFcmSender implements FcmSender {
  readonly sent: { token: string; cmd: FcmCommand }[] = [];
  async send(token: string, cmd: FcmCommand): Promise<void> { this.sent.push({ token, cmd }); }
}
