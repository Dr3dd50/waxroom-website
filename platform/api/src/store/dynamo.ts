// Production store: one DynamoDB table, partition key = collection, sort key = id.
// Reads are strongly consistent: a booking written a moment ago must be seen by the
// next availability check, or the same time could be sold twice.
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Collection } from '../types';
import type { Store } from './store';

export class DynamoStore implements Store {
  private db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  constructor(private table: string) {}

  async get<T>(col: Collection, id: string) {
    const r = await this.db.send(new GetCommand({ TableName: this.table, Key: { pk: col, sk: id }, ConsistentRead: true }));
    return r.Item ? (strip(r.Item) as T) : undefined;
  }
  async put<T extends { id: string }>(col: Collection, item: T) {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { ...item, pk: col, sk: item.id } }));
    return item;
  }
  async claim(col: Collection, id: string, ms: number) {
    const now = Date.now();
    try {
      await this.db.send(
        new PutCommand({
          TableName: this.table,
          Item: { pk: col, sk: id, id, until: now + ms },
          ConditionExpression: 'attribute_not_exists(pk) OR #u < :now',
          ExpressionAttributeNames: { '#u': 'until' },
          ExpressionAttributeValues: { ':now': now },
        }),
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  }
  async delete(col: Collection, id: string) {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: { pk: col, sk: id } }));
  }
  async list<T>(col: Collection) {
    return this.query<T>({ TableName: this.table, KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': col } });
  }
  async range<T>(col: Collection, from: string, to: string) {
    return this.query<T>({
      TableName: this.table,
      KeyConditionExpression: 'pk = :p AND sk BETWEEN :a AND :b',
      ExpressionAttributeValues: { ':p': col, ':a': from, ':b': to },
    });
  }
  private async query<T>(input: QueryCommandInput) {
    const out: T[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await this.db.send(new QueryCommand({ ...input, ConsistentRead: true, ExclusiveStartKey: start }));
      out.push(...(r.Items ?? []).map((i) => strip(i) as T));
      start = r.LastEvaluatedKey;
    } while (start);
    return out;
  }
}

function strip(item: Record<string, unknown>) {
  const { pk: _pk, sk: _sk, ...rest } = item;
  return rest;
}
