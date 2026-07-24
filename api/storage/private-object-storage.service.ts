import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

@Injectable()
export class PrivateObjectStorageService {
  private client: S3Client | null = null;
  private ready: Promise<void> | null = null;

  async put(key: string, bytes: Buffer, contentType: string, sha256: string) {
    const client = this.getClient();
    await this.ensureBucket();
    await client.send(new PutObjectCommand({
      Bucket: this.bucket(),
      Key: key,
      Body: bytes,
      ContentLength: bytes.length,
      ContentType: contentType,
      Metadata: { sha256 },
    }));
  }

  async get(key: string) {
    const client = this.getClient();
    await this.ensureBucket();
    try {
      const object = await client.send(new GetObjectCommand({ Bucket: this.bucket(), Key: key }));
      if (!object.Body) throw new NotFoundException("Arquivo privado não encontrado.");
      return Buffer.from(await object.Body.transformToByteArray());
    } catch (error) {
      if (storageStatus(error) === 404 || storageName(error) === "NoSuchKey") {
        throw new NotFoundException("Arquivo privado não encontrado.");
      }
      throw error;
    }
  }

  async remove(key: string) {
    try {
      await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }));
    } catch {
      // Limpeza compensatória: o erro original da persistência é mais relevante.
    }
  }

  async health() {
    await this.ensureBucket();
  }

  private getClient() {
    if (this.client) return this.client;
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
    const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException("Cofre documental não configurado.");
    }
    this.client = new S3Client({
      endpoint,
      region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }

  private ensureBucket() {
    if (!this.ready) this.ready = this.prepareBucket();
    return this.ready;
  }

  private async prepareBucket() {
    const client = this.getClient();
    const bucket = this.bucket();
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return;
    } catch (error) {
      if (storageStatus(error) !== 404 && storageName(error) !== "NotFound" && storageName(error) !== "NoSuchBucket") {
        this.ready = null;
        throw new ServiceUnavailableException("Cofre documental indisponível.");
      }
    }
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (!storageName(error).includes("BucketAlready")) {
        this.ready = null;
        throw new ServiceUnavailableException("Não foi possível preparar o cofre documental.");
      }
    }
  }

  private bucket() {
    return process.env.OBJECT_STORAGE_BUCKET ?? "max-service-private";
  }
}

function storageStatus(error: unknown) {
  return typeof error === "object" && error !== null && "$metadata" in error
    ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0)
    : 0;
}

function storageName(error: unknown) {
  return error instanceof Error ? error.name : "";
}
