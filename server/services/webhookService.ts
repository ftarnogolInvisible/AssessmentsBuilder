import { storage } from "../storage";
import type { ApiKey, WebhookEvent } from "../../shared/schema";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, any>;
}

export class WebhookService {
  private retryDelays = [1000, 2000, 5000, 10000, 30000]; // Delays in milliseconds

  /**
   * Trigger a webhook for an API key
   */
  async triggerWebhook(
    apiKey: ApiKey,
    eventType: string,
    payload: Record<string, any>
  ): Promise<WebhookEvent> {
    if (!apiKey.webhookUrl) {
      throw new Error("API key does not have a webhook URL configured");
    }

    const webhookPayload: WebhookPayload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    // Create webhook event record
    const webhookEvent = await storage.createWebhookEvent({
      apiKeyId: apiKey.id,
      eventType,
      payload: webhookPayload,
      status: "pending",
      retryCount: 0,
    });

    // Send webhook asynchronously
    this.sendWebhook(webhookEvent.id, apiKey.webhookUrl, webhookPayload).catch((error) => {
      console.error(`[Webhook] Failed to send webhook ${webhookEvent.id}:`, error);
    });

    return webhookEvent;
  }

  /**
   * Send webhook HTTP request
   */
  private async sendWebhook(
    eventId: string,
    url: string,
    payload: WebhookPayload
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "AssessmentBuilder-Webhook/1.0",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      const responseBody = await response.text();

      if (response.ok) {
        // Success
        await storage.updateWebhookEvent(eventId, {
          status: "sent",
          responseCode: response.status,
          responseBody: responseBody.substring(0, 1000), // Limit response body size
          sentAt: new Date(),
        });
      } else {
        // HTTP error - retry
        await this.handleWebhookFailure(eventId, response.status, responseBody);
      }
    } catch (error: any) {
      // Network error or timeout - retry
      await this.handleWebhookFailure(
        eventId,
        null,
        error?.message || "Network error"
      );
    }
  }

  /**
   * Handle webhook failure and schedule retry if applicable
   */
  private async handleWebhookFailure(
    eventId: string,
    responseCode: number | null,
    responseBody: string
  ): Promise<void> {
    const event = await storage.getWebhookEvent(eventId);
    if (!event) {
      return;
    }

    const retryCount = event.retryCount + 1;
    const maxRetries = 5;

    if (retryCount >= maxRetries) {
      // Max retries reached - mark as failed
      await storage.updateWebhookEvent(eventId, {
        status: "failed",
        responseCode,
        responseBody: responseBody.substring(0, 1000),
        retryCount,
      });
      return;
    }

    // Schedule retry
    const delay = this.retryDelays[retryCount - 1] || this.retryDelays[this.retryDelays.length - 1];
    
    await storage.updateWebhookEvent(eventId, {
      responseCode,
      responseBody: responseBody.substring(0, 1000),
      retryCount,
    });

    // Retry after delay
    setTimeout(async () => {
      const retryEvent = await storage.getWebhookEvent(eventId);
      if (!retryEvent || retryEvent.status !== "pending") {
        return;
      }

      if (!retryEvent.apiKeyId) {
        await storage.updateWebhookEvent(eventId, {
          status: "failed",
        });
        return;
      }

      const apiKey = await storage.getApiKeyById(retryEvent.apiKeyId);

      if (!apiKey || !apiKey.webhookUrl || !apiKey.active) {
        await storage.updateWebhookEvent(eventId, {
          status: "failed",
        });
        return;
      }

      this.sendWebhook(eventId, apiKey.webhookUrl, retryEvent.payload as WebhookPayload).catch(
        (error) => {
          console.error(`[Webhook] Retry failed for ${eventId}:`, error);
        }
      );
    }, delay);
  }

  /**
   * Process pending webhook events (for background job)
   */
  async processPendingWebhooks(): Promise<void> {
    const pendingEvents = await storage.getPendingWebhookEvents(100);

    for (const event of pendingEvents) {
      if (!event.apiKeyId) {
        continue;
      }

      const apiKey = await storage.getApiKeyById(event.apiKeyId);
      if (!apiKey || !apiKey.webhookUrl || !apiKey.active) {
        await storage.updateWebhookEvent(event.id, {
          status: "failed",
        });
        continue;
      }

      // Retry sending the webhook
      this.sendWebhook(event.id, apiKey.webhookUrl, event.payload as WebhookPayload).catch(
        (error) => {
          console.error(`[Webhook] Retry failed for ${event.id}:`, error);
        }
      );
    }
  }

  /**
   * Trigger webhook for submission completion
   */
  async triggerSubmissionWebhook(
    apiKey: ApiKey,
    submission: any,
    assessment: any,
    responses: any[]
  ): Promise<void> {
    await this.triggerWebhook(apiKey, "submission.completed", {
      submission: {
        id: submission.id,
        email: submission.email,
        firstName: submission.firstName,
        lastName: submission.lastName,
        status: submission.status,
        progress: submission.progress,
        totalScore: submission.totalScore,
        maxScore: submission.maxScore,
        submittedAt: submission.submittedAt,
        createdAt: submission.createdAt,
      },
      assessment: {
        id: assessment.id,
        name: assessment.name,
        publicUrl: assessment.publicUrl,
      },
      responses: responses.map((r) => ({
        id: r.id,
        blockId: r.blockId,
        responseData: r.responseData,
        score: r.score,
        maxScore: r.maxScore,
      })),
    });
  }
}

export const webhookService = new WebhookService();

