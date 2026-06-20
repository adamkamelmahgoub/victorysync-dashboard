import test from 'node:test';
import assert from 'node:assert/strict';
import { directionFromText, normalizePhoneDigitsForOwnership } from '../integrations/mightycall';
import {
  detectDirectionFromNumbers,
  detectTransferFromCallDetail,
  findRecordingUrl,
  liveStatusFromCall,
  normalizePhone,
} from '../mightycall/normalizers';
import { normalizeFromRawStatus } from '../services/mightycallLiveStatus';

test('live status normalization treats direct active states as on-call', () => {
  assert.equal(normalizeFromRawStatus('Connected'), 'on_call');
  assert.equal(normalizeFromRawStatus('On Call'), 'on_call');
  assert.equal(normalizeFromRawStatus('Talking'), 'on_call');
});

test('live status normalization preserves ringing, dialing, and idle states', () => {
  assert.equal(normalizeFromRawStatus('Ringing'), 'ringing');
  assert.equal(normalizeFromRawStatus('Dialing'), 'dialing');
  assert.equal(normalizeFromRawStatus('On Hold'), 'on_hold');
  assert.equal(normalizeFromRawStatus('Transfer in progress'), 'transferring');
  assert.equal(normalizeFromRawStatus('Available'), 'available');
  assert.equal(normalizeFromRawStatus('Offline'), 'offline');
});

test('sms direction parser never defaults ambiguous text to inbound', () => {
  assert.equal(directionFromText('Inbound SMS'), 'inbound');
  assert.equal(directionFromText('outbound'), 'outbound');
  assert.equal(directionFromText('Message'), 'unknown');
  assert.equal(directionFromText(''), 'unknown');
});

test('phone ownership digit normalization strips formatting', () => {
  assert.equal(normalizePhoneDigitsForOwnership('+1 (732) 847-9836'), '17328479836');
  assert.equal(normalizePhoneDigitsForOwnership('732-847-9836'), '7328479836');
});

test('api-only live call rows promote active calls and ignore completed calls', () => {
  assert.equal(liveStatusFromCall({ callStatus: 'Connected', endedAt: null }), 'on_call');
  assert.equal(liveStatusFromCall({ state: 'Ringing' }), 'ringing');
  assert.equal(liveStatusFromCall({ status: 'Completed', endedAt: '2026-05-24T10:00:00Z' }), null);
});

test('api-only SMS direction uses assigned business number ownership', () => {
  const assigned = [normalizePhone('+1 (732) 847-9836')!];
  assert.equal(detectDirectionFromNumbers('+17328479836', '+15551234567', assigned), 'outbound');
  assert.equal(detectDirectionFromNumbers('+15551234567', '+17328479836', assigned), 'inbound');
  assert.equal(detectDirectionFromNumbers('+15551234567', '+15557654321', assigned), 'unknown');
});

test('api-only call detail extracts recordings and transfer fields defensively', () => {
  assert.equal(findRecordingUrl({ callRecord: { uri: 'https://example.test/recording.mp3' } }), 'https://example.test/recording.mp3');
  assert.deepEqual(detectTransferFromCallDetail({ legs: [{ transferredTo: '204', transferType: 'warm', transferStatus: 'completed' }] }), {
    transferTarget: '204',
    transferType: 'warm',
    transferStatus: 'completed',
  });
});
