// firebase-admin@14는 admin.messaging()/admin.credential/admin.apps 같은 네임스페이스 API를
// 완전히 제거하고 서브패스 모듈 함수만 export한다 (firebase-admin/app, firebase-admin/messaging).
// 따라서 태스크 지시의 `import admin from 'firebase-admin'` 네임스페이스 스타일 대신
// 아래 모듈러 API로 구현한다. (동작/공개 인터페이스는 동일 — FcmMessagingClient/FirebaseFcmSender/
// createFcmSender의 시그니처와 payload 형태는 지시대로 유지)
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { Config } from '../config.js';

export type FcmCommand = { type: 'RING' | 'LOCATE_NOW' };
export interface FcmSender { send(token: string, cmd: FcmCommand): Promise<void>; }
export class StubFcmSender implements FcmSender {
  readonly sent: { token: string; cmd: FcmCommand }[] = [];
  async send(token: string, cmd: FcmCommand): Promise<void> { this.sent.push({ token, cmd }); }
}

/**
 * firebase-admin의 messaging().send()를 감싸는 최소 인터페이스.
 * FirebaseFcmSender를 실제 Firebase 없이 단위 테스트할 수 있도록 주입 가능하게 분리한다.
 */
export interface FcmMessagingClient {
  send(message: { token: string; data: Record<string, string>; android?: { priority: 'high' | 'normal' } }): Promise<string>;
}

/**
 * 실제 FCM 발송기. Android PadMessagingService가 message.data["command"]를
 * "RING"/"LOCATE_NOW"로 읽으므로, notification이 아닌 data payload로 보낸다.
 */
export class FirebaseFcmSender implements FcmSender {
  constructor(private readonly messaging: FcmMessagingClient) {}
  async send(token: string, cmd: FcmCommand): Promise<void> {
    await this.messaging.send({ token, data: { command: cmd.type }, android: { priority: 'high' } });
  }
}

/**
 * config.FIREBASE_SERVICE_ACCOUNT(서비스계정 JSON 파일 경로)가 없으면 StubFcmSender,
 * 있으면 firebase-admin을 초기화해 실제 FCM 발송기를 생성한다.
 * 초기화 실패(예: 잘못된 키 경로) 시 부팅이 죽지 않도록 StubFcmSender로 폴백한다.
 */
export function createFcmSender(config: Config): FcmSender {
  if (!config.FIREBASE_SERVICE_ACCOUNT) return new StubFcmSender();
  try {
    const app = getApps().length ? getApp() : initializeApp({
      credential: cert(config.FIREBASE_SERVICE_ACCOUNT),
    });
    const messagingClient: FcmMessagingClient = {
      send: (message) => getMessaging(app).send(message as Parameters<ReturnType<typeof getMessaging>['send']>[0]),
    };
    return new FirebaseFcmSender(messagingClient);
  } catch (err) {
    console.warn('FCM: firebase-admin 초기화 실패, StubFcmSender로 폴백합니다.', err);
    return new StubFcmSender();
  }
}
