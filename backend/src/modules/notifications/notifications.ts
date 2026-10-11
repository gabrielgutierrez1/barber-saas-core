import { Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { DateTime } from 'luxon';
import { Database, lock } from '../../common/database';
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private db: Database) {}
  onModuleInit() {
    if (process.env.BACKGROUND_JOBS !== 'false')
      this.timer = setInterval(() => void this.tick(), 30_000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running || !process.env.SMTP_HOST) return;
    this.running = true;
    try {
      const salon = await this.db.salon.findUniqueOrThrow({ where: { id: 1 } });
      const reminders = await this.db.reservation.findMany({
        where: {
          status: 'CONFIRMED',
          startsAt: { gt: new Date(), lt: new Date(Date.now() + 24 * 3600_000) },
        },
      });
      for (const r of reminders) {
        const key = `reminder:${r.id}:${r.startsAt.toISOString()}`;
        await this.db.emailJob.upsert({
          where: { key },
          update: {},
          create: {
            key,
            to: r.customerEmail,
            subject: `Recordatorio: ${salon.name}`,
            text: `Te esperamos el ${DateTime.fromJSDate(r.startsAt).setZone(salon.timeZone).toFormat('dd/MM/yyyy HH:mm')} para ${r.serviceName}. Contacto: ${salon.contactPhone}`,
          },
        });
      }
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        ...(process.env.SMTP_USER
          ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
          : {}),
        connectionTimeout: 10000,
        socketTimeout: 15000,
      });
      for (let i = 0; i < 10; i++) {
        const job = await this.db.$transaction(async (tx) => {
          await lock(tx, 'email');
          const j = await tx.emailJob.findFirst({
            where: {
              sentAt: null,
              attempts: { lt: 8 },
              availableAt: { lte: new Date() },
              OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
            },
            orderBy: { createdAt: 'asc' },
          });
          if (!j) return null;
          await tx.emailJob.update({
            where: { id: j.id },
            data: { leaseUntil: new Date(Date.now() + 60_000), attempts: { increment: 1 } },
          });
          return j;
        });
        if (!job) break;
        try {
          await transport.sendMail({
            from: process.env.SMTP_FROM,
            to: job.to,
            subject: job.subject,
            text: job.text,
            messageId: `<${job.id}@${new URL(process.env.PUBLIC_WEB_URL!).hostname}>`,
          });
          await this.db.emailJob.update({
            where: { id: job.id },
            data: { sentAt: new Date(), leaseUntil: null },
          });
        } catch {
          await this.db.emailJob.update({
            where: { id: job.id },
            data: {
              leaseUntil: null,
              availableAt: new Date(Date.now() + Math.min(3600, 2 ** job.attempts * 30) * 1000),
            },
          });
          console.error(JSON.stringify({ event: 'email_delivery_failed', jobId: job.id }));
        }
      }
    } catch {
      console.error(JSON.stringify({ event: 'notification_worker_failed' }));
    } finally {
      this.running = false;
    }
  }
}
@Module({ providers: [NotificationsService] })
export class NotificationsModule {}
