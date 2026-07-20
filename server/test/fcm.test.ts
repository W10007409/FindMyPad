import { describe, it, expect } from 'vitest';
import { StubFcmSender, FirebaseFcmSender, createFcmSender, type FcmMessagingClient } from '../src/services/fcm.js';
import { loadConfig } from '../src/config.js';

describe('StubFcmSender', () => {
  it('send가 sent 배열에 기록', async () => {
    const fcm = new StubFcmSender();
    await fcm.send('tok', { type: 'RING' });
    expect(fcm.sent).toEqual([{ token: 'tok', cmd: { type: 'RING' } }]);
  });
});

describe('FirebaseFcmSender', () => {
  function makeFakeClient() {
    const sentMessages: unknown[] = [];
    const client: FcmMessagingClient = {
      async send(message) {
        sentMessages.push(message);
        return 'projects/x/messages/fake-id';
      },
    };
    return { client, sentMessages };
  }

  it('RING 커맨드를 data payload로 전송', async () => {
    const { client, sentMessages } = makeFakeClient();
    const sender = new FirebaseFcmSender(client);
    await sender.send('TOK', { type: 'RING' });
    expect(sentMessages).toEqual([
      { token: 'TOK', data: { command: 'RING' }, android: { priority: 'high' } },
    ]);
  });

  it('LOCATE_NOW 커맨드를 data payload로 전송', async () => {
    const { client, sentMessages } = makeFakeClient();
    const sender = new FirebaseFcmSender(client);
    await sender.send('TOK', { type: 'LOCATE_NOW' });
    expect(sentMessages).toEqual([
      { token: 'TOK', data: { command: 'LOCATE_NOW' }, android: { priority: 'high' } },
    ]);
  });
});

describe('createFcmSender', () => {
  it('FIREBASE_SERVICE_ACCOUNT 미설정 시 StubFcmSender 반환', () => {
    const config = loadConfig({ DATABASE_URL: 'x', JWT_SECRET: '0123456789abcdef' });
    const sender = createFcmSender(config);
    expect(sender).toBeInstanceOf(StubFcmSender);
  });

  it('FIREBASE_SERVICE_ACCOUNT가 존재하지 않는 파일 경로면 부팅이 죽지 않고 StubFcmSender로 폴백', () => {
    const config = loadConfig({
      DATABASE_URL: 'x',
      JWT_SECRET: '0123456789abcdef',
      FIREBASE_SERVICE_ACCOUNT: '/nonexistent/does-not-exist-sa.json',
    });
    const sender = createFcmSender(config);
    expect(sender).toBeInstanceOf(StubFcmSender);
  });

  it('FIREBASE_SERVICE_ACCOUNT가 손상된 JSON 내용이면 경로로 취급되어 StubFcmSender로 폴백', () => {
    const config = loadConfig({
      DATABASE_URL: 'x',
      JWT_SECRET: '0123456789abcdef',
      FIREBASE_SERVICE_ACCOUNT: '{not json',
    });
    const sender = createFcmSender(config);
    expect(sender).toBeInstanceOf(StubFcmSender);
  });
});
