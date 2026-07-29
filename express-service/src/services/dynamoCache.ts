import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';
import { StructuredAddress } from '../models/address';
import { ValidationResult } from '../models/validation';

// DynamoDB client - uses AWS credentials from environment or IAM role
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-2',
});
const db = DynamoDBDocumentClient.from(client);

// Table names
const CACHE_TABLE = 'address-validations';
const LOGS_TABLE = 'validation-logs';

/**
 * Generate a hash key from an address for cache lookup.
 * Normalizes to lowercase so "123 Main St" and "123 main st" hit the same cache entry.
 */
function hashAddress(address: StructuredAddress): string {
  const normalized = JSON.stringify({
    street_line_1: (address.street_line_1 || '').toLowerCase().trim(),
    street_line_2: (address.street_line_2 || '').toLowerCase().trim(),
    city: (address.city || '').toLowerCase().trim(),
    state: (address.state || '').toLowerCase().trim(),
    zipcode: (address.zipcode || '').trim(),
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Check if we already validated this address before.
 * Returns the cached ValidationResult or null if not found.
 */
export async function getCachedValidation(
  address: StructuredAddress
): Promise<ValidationResult | null> {
  try {
    const hash = hashAddress(address);
    const result = await db.send(
      new GetCommand({
        TableName: CACHE_TABLE,
        Key: { address_hash: hash },
      })
    );

    if (result.Item) {
      return {
        original_address: result.Item.original_address as StructuredAddress,
        standardized_address: result.Item.standardized_address as StructuredAddress | undefined,
        status: result.Item.status as 'valid' | 'invalid' | 'invalid_input' | 'parse_failed',
        error_message: result.Item.error_message as string | undefined,
      };
    }
    return null;
  } catch (err) {
    // If DynamoDB is unavailable, just skip cache (don't break the app)
    console.error('DynamoDB cache read error:', err);
    return null;
  }
}

/**
 * Store a validation result in the cache.
 * TTL is set to 30 days — after that DynamoDB auto-deletes the item.
 */
export async function cacheValidation(
  address: StructuredAddress,
  result: ValidationResult
): Promise<void> {
  try {
    const hash = hashAddress(address);
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    await db.send(
      new PutCommand({
        TableName: CACHE_TABLE,
        Item: {
          address_hash: hash,
          original_address: address,
          standardized_address: result.standardized_address || null,
          status: result.status,
          error_message: result.error_message || null,
          validated_at: new Date().toISOString(),
          ttl,
        },
      })
    );
  } catch (err) {
    // Don't break the app if cache write fails
    console.error('DynamoDB cache write error:', err);
  }
}

/**
 * Log every validation request for audit purposes.
 */
export async function logValidationRequest(
  endpoint: string,
  input: unknown,
  result: unknown,
  statusCode: number
): Promise<void> {
  try {
    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    await db.send(
      new PutCommand({
        TableName: LOGS_TABLE,
        Item: {
          request_id: requestId,
          timestamp,
          endpoint,
          input,
          result,
          status_code: statusCode,
        },
      })
    );
  } catch (err) {
    // Logging should never break the app
    console.error('DynamoDB log write error:', err);
  }
}
