import { describe, it, expect } from 'vitest';
import { isValidKeyword, sanitizeKeyword } from './validation.utils';

describe('isValidKeyword', () => {
  it('should accept simple alphanumeric strings', () => {
    expect(isValidKeyword('test')).toBe(true);
    expect(isValidKeyword('Test123')).toBe(true);
    expect(isValidKeyword('abc')).toBe(true);
  });

  it('should accept strings with allowed special characters', () => {
    expect(isValidKeyword('test_keyword')).toBe(true);
    expect(isValidKeyword('test-keyword')).toBe(true);
    expect(isValidKeyword('test.keyword')).toBe(true);
    expect(isValidKeyword('_underscore')).toBe(true);
    expect(isValidKeyword('-dash')).toBe(true);
    expect(isValidKeyword('.dot')).toBe(true);
    expect(isValidKeyword('test_123-abc.xyz')).toBe(true);
  });

  it('should accept unicode letters', () => {
    expect(isValidKeyword('Thema')).toBe(true);
    expect(isValidKeyword('Prüfung')).toBe(true);
    expect(isValidKeyword('Büro')).toBe(true);
    expect(isValidKeyword('日本語')).toBe(true);
    expect(isValidKeyword('κόσμε')).toBe(true);
  });

  it('should reject strings with spaces', () => {
    expect(isValidKeyword('test keyword')).toBe(false);
    expect(isValidKeyword(' test')).toBe(false);
    expect(isValidKeyword('test ')).toBe(false);
    expect(isValidKeyword('test  keyword')).toBe(false);
  });

  it('should reject strings with special characters', () => {
    expect(isValidKeyword('test@keyword')).toBe(false);
    expect(isValidKeyword('test#keyword')).toBe(false);
    expect(isValidKeyword('test$keyword')).toBe(false);
    expect(isValidKeyword('test%keyword')).toBe(false);
    expect(isValidKeyword('test&keyword')).toBe(false);
    expect(isValidKeyword('test*keyword')).toBe(false);
    expect(isValidKeyword('test+keyword')).toBe(false);
    expect(isValidKeyword('test=keyword')).toBe(false);
    expect(isValidKeyword('test!keyword')).toBe(false);
    expect(isValidKeyword('test?keyword')).toBe(false);
    expect(isValidKeyword('test/keyword')).toBe(false);
    expect(isValidKeyword('test\\keyword')).toBe(false);
    expect(isValidKeyword('test(keyword)')).toBe(false);
    expect(isValidKeyword('test[keyword]')).toBe(false);
    expect(isValidKeyword('test{keyword}')).toBe(false);
    expect(isValidKeyword('test<keyword>')).toBe(false);
    expect(isValidKeyword("test'keyword")).toBe(false);
    expect(isValidKeyword('test"keyword')).toBe(false);
    expect(isValidKeyword('test:keyword')).toBe(false);
    expect(isValidKeyword('test;keyword')).toBe(false);
    expect(isValidKeyword('test,keyword')).toBe(false);
  });

  it('should reject empty strings', () => {
    expect(isValidKeyword('')).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(isValidKeyword(null as unknown as string)).toBe(false);
    expect(isValidKeyword(undefined as unknown as string)).toBe(false);
  });
});

describe('sanitizeKeyword', () => {
  it('should return the value unchanged if it is already valid', () => {
    expect(sanitizeKeyword('test')).toBe('test');
    expect(sanitizeKeyword('test_keyword')).toBe('test_keyword');
    expect(sanitizeKeyword('test-keyword')).toBe('test-keyword');
    expect(sanitizeKeyword('test.keyword')).toBe('test.keyword');
  });

  it('should replace spaces with underscores', () => {
    expect(sanitizeKeyword('test keyword')).toBe('test_keyword');
    expect(sanitizeKeyword('test  keyword')).toBe('test_keyword');
    expect(sanitizeKeyword('test   keyword')).toBe('test_keyword');
  });

  it('should remove special characters', () => {
    expect(sanitizeKeyword('test@keyword')).toBe('testkeyword');
    expect(sanitizeKeyword('test#keyword')).toBe('testkeyword');
    expect(sanitizeKeyword('test$%^&*keyword')).toBe('testkeyword');
  });

  it('should preserve unicode letters', () => {
    expect(sanitizeKeyword('Prüfung')).toBe('Prüfung');
    expect(sanitizeKeyword('日本語')).toBe('日本語');
    expect(sanitizeKeyword('Prüfung Test')).toBe('Prüfung_Test');
  });

  it('should handle empty strings', () => {
    expect(sanitizeKeyword('')).toBe('');
  });

  it('should handle null/undefined', () => {
    expect(sanitizeKeyword(null as unknown as string)).toBe('');
    expect(sanitizeKeyword(undefined as unknown as string)).toBe('');
  });

  it('should combine multiple sanitization operations', () => {
    expect(sanitizeKeyword('test @keyword# 123')).toBe('test_keyword_123');
  });
});
