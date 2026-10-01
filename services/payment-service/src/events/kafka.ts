import { Kafka, SASLOptions } from "kafkajs";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";

export function createKafka(clientId: string): Kafka {
  const saslUsername = process.env.KAFKA_SASL_USERNAME;
  const saslPassword = process.env.KAFKA_SASL_PASSWORD;

  if (saslUsername && saslPassword) {
    const mechanism = (process.env.KAFKA_SASL_MECHANISM || "scram-sha-256");
    const sasl = { mechanism, username: saslUsername, password: saslPassword } as SASLOptions;

    const caCertB64 = process.env.KAFKA_CA_CERT_B64;
    const ssl = caCertB64
      ? { ca: Buffer.from(caCertB64, "base64").toString("utf8") }
      : true;

    return new Kafka({
      clientId,
      brokers: [KAFKA_BROKER],
      ssl,
      sasl,
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    });
  }

  return new Kafka({
    clientId,
    brokers: [KAFKA_BROKER],
    retry: {
      initialRetryTime: 300,
      retries: 10,
    },
  });
}
