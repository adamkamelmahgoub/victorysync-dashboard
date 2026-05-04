import test from 'node:test';
import assert from 'node:assert/strict';
import { directionFromText, normalizePhoneDigitsForOwnership } from '../integrations/mightycall';
import { normalizeFromRawStatus } from '../services/mightycallLiveStatus';

test('live status normalization treats direct active states as on-call', () => {
  assert.equal(normalizeFromRawStatus('Connected'), 'on_call');
  assert.equal(normalizeFromRawStatus('On Call'), 'on_call');
  assert.equal(normalizeFromRawStatus('Talking'), 'on_call');
});

test('live status normalization preserves ringing, dialing, and idle states', () => {
  assert.equal(normalizeFromRawStatus('Ringing'), 'ringing');
  assert.equal(normalizeFromRawStatus('Dialing'), 'dialing');
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
