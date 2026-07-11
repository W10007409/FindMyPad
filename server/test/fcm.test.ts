import { describe, it, expect } from 'vitest';
import { StubFcmSender } from '../src/services/fcm.js';

describe('StubFcmSender', () => {
  it('send가 sent 배열에 기록', async () => {
    const fcm = new StubFcmSender();
    await fcm.send('tok', { type: 'RING' });
    expect(fcm.sent).toEqual([{ token: 'tok', cmd: { type: 'RING' } }]);
  });
});
