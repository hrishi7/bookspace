import * as amqp from 'amqplib/callback_api';
import { createLogger } from '@bookspace/logger';
import { Event } from './events';

const logger = createLogger({ service: 'messaging' });

export class MessageBroker {
  private connection: any = null;
  private channel: any = null;
  private readonly url: string;

  private readonly EXCHANGE_NAME = 'bookspace.events';
  private readonly DLX_NAME = 'bookspace.events.dlx';

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      amqp.connect(this.url, (err, conn) => {
        if (err) {
          logger.error({ error: err }, 'Failed to connect to RabbitMQ');
          return reject(err);
        }

        this.connection = conn;

        conn.on('error', (error: Error) => {
          logger.error({ error }, 'RabbitMQ connection error');
        });

        conn.on('close', () => {
          logger.warn('RabbitMQ connection closed');
        });

        conn.createChannel((err2, ch) => {
          if (err2) {
            return reject(err2);
          }

          this.channel = ch;
          
          this.setupExchanges()
            .then(() => {
              logger.info('Connected to RabbitMQ');
              resolve();
            })
            .catch(reject);
        });
      });  
    });
  }

  private async setupExchanges(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.channel.assertExchange(this.EXCHANGE_NAME, 'fanout', { durable: true }, (err: Error) => {
        if (err) return reject(err);

        this.channel.assertExchange(this.DLX_NAME, 'fanout', { durable: true }, (err2: Error) => {
          if (err2) return reject(err2);
          logger.info('Exchanges created');
          resolve();
        });
      });
    });
  }

  async publish(event: Event): Promise<void> {
    if (!this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    const message = JSON.stringify(event);
    
    this.channel.publish(
      this.EXCHANGE_NAME,
      '',
      Buffer.from(message),
      {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now(),
      }
    );

    logger.debug({ event: event.type }, 'Event published');
  }

  async subscribe(
    queueName: string,
    handler: (event: Event) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    return new Promise((resolve, reject) => {
      this.channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': this.DLX_NAME,
        },
      }, (err: Error) => {
        if (err) return reject(err);

       this.channel.bindQueue(queueName, this.EXCHANGE_NAME, '', {}, (err2: Error) => {
          if (err2) return reject(err2);

          this.channel.prefetch(10);

          this.channel.consume(
            queueName,
            async (msg: any) => {
              if (!msg) return;

              try {
                const event = JSON.parse(msg.content.toString()) as Event;
                await handler(event);
                this.channel.ack(msg);
                
                logger.debug({ event: event.type }, 'Event processed');
              } catch (error) {
                logger.error({ error }, 'Failed to process event');

                const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;
                const maxRetries = 3;

                if (retryCount < maxRetries) {
                  const delay = Math.pow(2, retryCount) * 1000;
                  
                  setTimeout(() => {
                    if (!this.channel) return;
                    
                    this.channel.publish(
                      this.EXCHANGE_NAME,
                      '',
                      msg.content,
                      {
                        ...msg.properties,
                        headers: {
                          ...msg.properties.headers,
                          'x-retry-count': retryCount + 1,
                        },
                      }
                    );

                    this.channel.ack(msg);
                  }, delay);
                } else {
                  this.channel.reject(msg, false);
                  logger.error({ event: JSON.parse(msg.content.toString()).type }, 'Message moved to DLQ');
                }
              }
            },
            {
              noAck: false,
            }
          );

          logger.info({ queue: queueName }, 'Subscribed to queue');
          resolve();
        });
      });
    });
  }

  async assertDeadLetterQueue(): Promise<void> {
    if (!this.channel) throw new Error('Not connected');

    const DLQ_NAME = 'bookspace.events.dlq';

    return new Promise((resolve, reject) => {
      this.channel.assertQueue(DLQ_NAME, { durable: true }, (err: Error) => {
        if (err) return reject(err);

        this.channel.bindQueue(DLQ_NAME, this.DLX_NAME, '', {}, (err2: Error) => {
          if (err2) return reject(err2);
          logger.info('Dead Letter Queue created');
          resolve();
        });
      });
    });
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await new Promise((resolve) => this.channel.close(() => resolve(undefined)));
      }
      if (this.connection) {
        await new Promise((resolve) => this.connection.close(() => resolve(undefined)));
      }
      logger.info('Disconnected from RabbitMQ');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting from RabbitMQ');
    }
  }
}

let messageBroker: MessageBroker | null = null;

export function getMessageBroker(url?: string): MessageBroker {
  if (!messageBroker) {
    if (!url) throw new Error('RabbitMQ URL required');
    messageBroker = new MessageBroker(url);
  }
  return messageBroker;
}
