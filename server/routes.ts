import type { Express } from "express";
import { Router } from "express";
import { storage } from "./storage";
import { authenticateToken } from "./middleware/auth";
import { authenticateApiKey, requirePermission } from "./middleware/apiKeyAuth";
import { configureCORS, configureHelmet, publicRateLimit, adminRateLimit } from "./middleware/security";
import { webhookService } from "./services/webhookService";

export async function registerRoutes(app: Express): Promise<void> {
  console.log('[BOOT] Routes file loaded');
  
  // Log all registered routes for debugging
  const logRoutes = () => {
    const routes: string[] = [];
    app._router?.stack?.forEach((middleware: any) => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods).join(',').toUpperCase();
        routes.push(`${methods} ${middleware.route.path}`);
      }
    });
    console.log('[BOOT] Registered routes:', routes.filter(r => r.includes('/api/admin')));
  };

  // Apply security middleware
  // In development, use relaxed security for Vite HMR
  if (process.env.NODE_ENV === "development") {
    // Minimal security headers in development
    app.use((req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      next();
    });
  } else {
    // Full security in production
    app.use(configureHelmet());
  }
  
  app.use(configureCORS());

  // Rate limiting
  app.use("/api", publicRateLimit);
  app.use("/api/admin", adminRateLimit);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Development: Initialize dev client if needed
  if (process.env.NODE_ENV === "development") {
    app.post("/api/dev/clear-all", async (_req, res) => {
      try {
        console.log("[DEV] Clearing all assessment data...");
        await storage.clearAllAssessmentData();
        console.log("[DEV] All data cleared successfully");
        res.json({ success: true, message: "All campaigns, projects, and assessments cleared" });
      } catch (error: any) {
        console.error("[DEV] Error clearing data:", error);
        res.status(500).json({ error: "Failed to clear data", details: error?.message });
      }
    });

    app.post("/api/dev/init", async (_req, res) => {
      try {
        const clientId = process.env.DEV_CLIENT_ID || "dev-client-id";
        // Check if client exists
        const existingClient = await storage.getClient(clientId);
        if (!existingClient) {
          // Create dev client
          await storage.createClient({
            id: clientId,
            name: "Development Client",
            description: "Development client for testing",
            active: true,
          });
          res.json({ success: true, message: "Dev client initialized", clientId });
        } else {
          res.json({ success: true, message: "Dev client already exists", clientId });
        }
      } catch (error: any) {
        // If client already exists (unique constraint), that's fine
        if (error?.code === "23505") {
          res.json({ success: true, message: "Dev client already exists", clientId: process.env.DEV_CLIENT_ID || "dev-client-id" });
        } else {
          console.error("Error initializing dev client:", error);
          res.status(500).json({ error: "Failed to initialize dev client", details: error?.message });
        }
      }
    });

    app.post("/api/dev/clear-all", async (_req, res) => {
      try {
        console.log("[DEV] Clearing all assessment data...");
        await storage.clearAllAssessmentData();
        console.log("[DEV] All data cleared successfully");
        
        // Recreate dev client after clearing
        const clientId = process.env.DEV_CLIENT_ID || "dev-client-id";
        try {
          await storage.createClient({
            id: clientId,
            name: "Development Client",
            description: "Development client for testing",
            active: true,
          });
          console.log("[DEV] Dev client recreated after clear");
        } catch (clientError: any) {
          if (clientError?.code !== "23505") {
            console.error("[DEV] Error recreating dev client:", clientError);
          }
        }
        
        res.json({ success: true, message: "All campaigns, projects, and assessments cleared. Dev client recreated." });
      } catch (error: any) {
        console.error("[DEV] Error clearing data:", error);
        res.status(500).json({ error: "Failed to clear data", details: error?.message });
      }
    });
  }

  // =============================================================================
  // PUBLIC ASSESSMENT ROUTES
  // =============================================================================

  // Get published assessment by public URL
  app.get("/api/assessment/:publicUrl", async (req, res) => {
    try {
      const assessment = await storage.getAssessmentByPublicUrl(req.params.publicUrl);
      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }
      if (assessment.status !== "published") {
        return res.status(403).json({ error: "Assessment is not published" });
      }
      const blocks = await storage.getBlocks(assessment.id);
      res.json({ ...assessment, blocks });
    } catch (error) {
      console.error("Error fetching public assessment:", error);
      res.status(500).json({ error: "Failed to fetch assessment" });
    }
  });

  // Submit assessment response
  app.post("/api/assessment/:publicUrl/submit", async (req, res) => {
    try {
      console.log("[Routes] Submitting assessment for publicUrl:", req.params.publicUrl);
      console.log("[Routes] Request body:", JSON.stringify(req.body, null, 2));
      
      const assessment = await storage.getAssessmentByPublicUrl(req.params.publicUrl);
      if (!assessment) {
        console.log("[Routes] Assessment not found for publicUrl:", req.params.publicUrl);
        return res.status(404).json({ error: "Assessment not found" });
      }
      if (assessment.status !== "published") {
        console.log("[Routes] Assessment not published:", assessment.id, assessment.status);
        return res.status(403).json({ error: "Assessment is not published" });
      }

      const { email, firstName, lastName, name, responses } = req.body;
      
      console.log("[Routes] Creating submission with:", {
        assessmentId: assessment.id,
        clientId: assessment.clientId,
        email,
        firstName,
        lastName,
        name,
        responseCount: responses?.length || 0
      });
      
      // Create submission with status "to_review" instead of "completed"
      const submission = await storage.createAssessmentSubmission({
        assessmentId: assessment.id,
        clientId: assessment.clientId,
        email: email || null,
        firstName: firstName || null,
        lastName: lastName || null,
        name: name || (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || null), // Legacy field
        status: "to_review",
        progress: 100,
        submittedAt: new Date(),
      });

      console.log("[Routes] Submission created:", submission.id);

      // Create responses
      let totalScore = 0;
      let maxScore = 0;
      const responseList = responses || [];
      
      console.log("[Routes] Processing", responseList.length, "responses");
      
      for (const response of responseList) {
        if (!response.blockId) {
          console.warn("[Routes] Response missing blockId:", response);
          continue;
        }
        
        const block = await storage.getBlock(response.blockId);
        if (!block) {
          console.warn("[Routes] Block not found:", response.blockId);
          continue;
        }
        
        console.log("[Routes] Creating block response for block:", response.blockId, "type:", block.type);
        
        const blockResponse = await storage.createBlockResponse({
          submissionId: submission.id,
          blockId: response.blockId,
          responseData: response.responseData || {},
          score: response.score || null,
          maxScore: block.config?.points || null,
        });
        
        console.log("[Routes] Block response created:", blockResponse.id);
        
        if (blockResponse.score !== null) totalScore += blockResponse.score;
        if (blockResponse.maxScore !== null) maxScore += blockResponse.maxScore;
      }

      console.log("[Routes] Updating submission scores:", { totalScore, maxScore });

      // Update submission with scores
      await storage.updateAssessmentSubmission(submission.id, {
        totalScore,
        maxScore,
      });

      console.log("[Routes] Submission completed successfully:", submission.id);

      // Trigger webhooks for all active API keys with webhook URLs
      try {
        const apiKeys = await storage.getApiKeys(assessment.clientId);
        const activeApiKeys = apiKeys.filter(
          (key) => key.active && key.webhookUrl && !key.expiresAt || (key.expiresAt && new Date(key.expiresAt) > new Date())
        );

        for (const apiKey of activeApiKeys) {
          const blockResponses = await storage.getBlockResponses(submission.id);
          webhookService.triggerSubmissionWebhook(apiKey, submission, assessment, blockResponses).catch((error) => {
            console.error(`[Routes] Failed to trigger webhook for API key ${apiKey.id}:`, error);
          });
        }
      } catch (webhookError) {
        // Don't fail the submission if webhook fails
        console.error("[Routes] Error triggering webhooks:", webhookError);
      }

      res.json({ success: true, submissionId: submission.id });
    } catch (error: any) {
      console.error("[Routes] Error submitting assessment:", error);
      console.error("[Routes] Error details:", {
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      });
      res.status(500).json({ 
        error: "Failed to submit assessment",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // =============================================================================
  // ADMIN ROUTES (Protected)
  // =============================================================================

  // Create admin router
  const adminRouter = Router();
  adminRouter.use(authenticateToken);
  
  // Debug middleware to log all admin routes
  adminRouter.use((req: any, res: any, next: any) => {
    console.log(`[Routes] Admin route: ${req.method} ${req.path}`);
    next();
  });

  // Campaign routes - DELETE must come before GET to ensure proper matching
  adminRouter.delete("/campaigns/:id", async (req: any, res) => {
    console.log(`[Routes] DELETE /api/admin/campaigns/:id matched, id=${req.params.id}`);
    try {
      const campaignId = req.params.id;
      const clientId = req.user.clientId;
      console.log(`[Routes] Deleting campaign: id=${campaignId}, clientId=${clientId}`);
      await storage.deleteCampaign(campaignId, clientId);
      console.log(`[Routes] Campaign deleted successfully`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Routes] Error deleting campaign:", error);
      console.error("[Routes] Error details:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        constraint: error?.constraint,
      });
      res.status(500).json({ 
        error: "Failed to delete campaign",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.get("/campaigns", async (req: any, res) => {
    try {
      const clientId = req.user.clientId;
      const campaigns = await storage.getCampaigns(clientId);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  adminRouter.post("/campaigns", async (req: any, res) => {
    try {
      const clientId = req.user?.clientId;
      if (!clientId) {
        return res.status(400).json({ error: "Client ID is required" });
      }
      
      console.log(`[Routes] Creating campaign for clientId: ${clientId}`);
      console.log(`[Routes] Request body:`, req.body);
      
      // ALWAYS ensure client exists (for development)
      try {
        const client = await storage.getClient(clientId);
        if (!client) {
          console.log(`[DEV] Creating dev client: ${clientId}`);
          try {
            await storage.createClient({
              id: clientId,
              name: "Development Client",
              description: "Development client for testing",
              active: true,
            });
            console.log(`[DEV] Dev client created successfully`);
          } catch (createError: any) {
            // If it's a duplicate key error, that's fine - client was created between check and create
            if (createError?.code === "23505") {
              console.log(`[DEV] Dev client already exists (race condition)`);
            } else {
              throw createError;
            }
          }
        } else {
          console.log(`[DEV] Dev client already exists`);
        }
      } catch (clientError: any) {
        console.error("[Routes] Error ensuring dev client exists:", clientError);
        // Don't throw - try to continue anyway, might work if client exists
        if (clientError?.code !== "23505") {
          console.error("[Routes] Client check failed, but continuing...");
        }
      }
      
      const campaign = await storage.createCampaign({
        name: req.body.name || "Untitled Campaign",
        description: req.body.description || null,
        clientId: clientId,
        archived: false,
        tags: [],
      });
      
      console.log(`[Routes] Campaign created successfully:`, campaign.id);
      res.json(campaign);
    } catch (error: any) {
      // Filter out WebSocket errors
      if (error?.code === "ECONNREFUSED" && error?.message?.includes("WebSocket")) {
        console.error("[Routes] WebSocket error (ignoring):", error.message);
        return res.status(500).json({ error: "Database connection error. Please check server logs." });
      }
      
      console.error("[Routes] Error creating campaign:", error);
      console.error("[Routes] Error type:", error?.constructor?.name);
      console.error("[Routes] Error details:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        constraint: error?.constraint,
        name: error?.name,
        stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
      });
      
      res.status(500).json({ 
        error: "Failed to create campaign",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // Project routes - DELETE must come before GET to ensure proper matching
  adminRouter.delete("/projects/:id", async (req: any, res) => {
    console.log(`[Routes] DELETE /api/admin/projects/:id matched, id=${req.params.id}`);
    try {
      const projectId = req.params.id;
      const clientId = req.user.clientId;
      console.log(`[Routes] Deleting project: id=${projectId}, clientId=${clientId}`);
      await storage.deleteProject(projectId, clientId);
      console.log(`[Routes] Project deleted successfully`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Routes] Error deleting project:", error);
      console.error("[Routes] Error details:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        constraint: error?.constraint,
      });
      res.status(500).json({ 
        error: "Failed to delete project",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.get("/projects", async (req: any, res) => {
    try {
      const { campaignId } = req.query;
      if (!campaignId) {
        return res.status(400).json({ error: "campaignId is required" });
      }
      const projects = await storage.getProjects(campaignId, req.user.clientId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  adminRouter.post("/projects", async (req: any, res) => {
    try {
      const project = await storage.createProject({
        ...req.body,
        clientId: req.user.clientId,
      });
      res.json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  // Assessment routes - DELETE must come before GET to ensure proper matching
  adminRouter.delete("/assessments/:id", async (req: any, res) => {
    console.log(`[Routes] DELETE /api/admin/assessments/:id matched, id=${req.params.id}`);
    try {
      const assessmentId = req.params.id;
      const clientId = req.user.clientId;
      console.log(`[Routes] Deleting assessment: id=${assessmentId}, clientId=${clientId}`);
      await storage.deleteAssessment(assessmentId, clientId);
      console.log(`[Routes] Assessment deleted successfully`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Routes] Error deleting assessment:", error);
      console.error("[Routes] Error details:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        constraint: error?.constraint,
      });
      res.status(500).json({ 
        error: "Failed to delete assessment",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.get("/assessments", async (req: any, res) => {
    try {
      const { projectId } = req.query;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      const assessments = await storage.getAssessments(projectId, req.user.clientId);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ error: "Failed to fetch assessments" });
    }
  });

  adminRouter.post("/assessments", async (req: any, res) => {
    try {
      const { name, description, projectId } = req.body;
      const clientId = req.user.clientId;
      
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      
      console.log(`[Routes] Creating assessment: name=${name}, projectId=${projectId}, clientId=${clientId}`);
      
      const assessment = await storage.createAssessment({
        name: name || "Untitled Assessment",
        description: description || null,
        projectId: projectId,
        clientId: clientId,
        status: "draft",
        archived: false,
        tags: [],
        settings: {},
      });
      
      console.log(`[Routes] Assessment created successfully:`, assessment.id);
      res.json(assessment);
    } catch (error: any) {
      console.error("[Routes] Error creating assessment:", error);
      console.error("[Routes] Error details:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
      });
      res.status(500).json({ 
        error: "Failed to create assessment",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // Publish assessment (generates public URL) - MUST come before /assessments/:id route
  // Using a more specific route pattern to ensure it matches
  adminRouter.post("/assessments/:id/publish", async (req: any, res, next) => {
    console.log(`[Routes] POST /assessments/:id/publish route matched!`);
    console.log(`[Routes] Request params:`, req.params);
    console.log(`[Routes] Request path:`, req.path);
    console.log(`[Routes] Request originalUrl:`, req.originalUrl);
    console.log(`[Routes] Request body:`, req.body);
    try {
      const assessmentId = req.params.id;
      const clientId = req.user?.clientId;
      
      if (!clientId) {
        console.error("[Routes] No clientId in request user");
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      console.log(`[Routes] Publishing assessment: id=${assessmentId}, clientId=${clientId}`);
      
      const assessment = await storage.publishAssessment(assessmentId, clientId);
      console.log(`[Routes] Assessment published successfully:`, assessment.id, assessment.publicUrl);
      
      res.json(assessment);
    } catch (error: any) {
      console.error("[Routes] Error publishing assessment:", error);
      console.error("[Routes] Error details:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        stack: error?.stack,
      });
      res.status(500).json({ 
        error: "Failed to publish assessment",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // Unpublish assessment (removes public access) - MUST come before /assessments/:id route
  adminRouter.post("/assessments/:id/unpublish", async (req: any, res, next) => {
    console.log(`[Routes] POST /assessments/:id/unpublish route matched!`);
    console.log(`[Routes] Request params:`, req.params);
    console.log(`[Routes] Request path:`, req.path);
    console.log(`[Routes] Request originalUrl:`, req.originalUrl);
    console.log(`[Routes] Request body:`, req.body);
    try {
      const assessmentId = req.params.id;
      const clientId = req.user?.clientId;
      
      if (!clientId) {
        console.error("[Routes] No clientId in request user");
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      console.log(`[Routes] Unpublishing assessment: id=${assessmentId}, clientId=${clientId}`);
      
      const assessment = await storage.unpublishAssessment(assessmentId, clientId);
      console.log(`[Routes] Assessment unpublished successfully:`, assessment.id);
      
      res.json(assessment);
    } catch (error: any) {
      console.error("[Routes] Error unpublishing assessment:", error);
      console.error("[Routes] Error details:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        stack: error?.stack,
      });
      res.status(500).json({ 
        error: "Failed to unpublish assessment",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // Get single assessment with blocks
  adminRouter.get("/assessments/:id", async (req: any, res) => {
    try {
      const assessmentId = req.params.id;
      const clientId = req.user.clientId;
      
      const assessment = await storage.getAssessment(assessmentId, clientId);
      if (!assessment) {
        return res.status(404).json({ error: "Assessment not found" });
      }
      
      const blocks = await storage.getBlocks(assessmentId);
      res.json({ ...assessment, blocks });
    } catch (error: any) {
      console.error("[Routes] Error fetching assessment:", error);
      res.status(500).json({ 
        error: "Failed to fetch assessment",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // Update assessment metadata
  adminRouter.put("/assessments/:id", async (req: any, res) => {
    try {
      const assessmentId = req.params.id;
      const clientId = req.user.clientId;
      const { name, description, status, archived, tags, settings } = req.body;
      
      const assessment = await storage.updateAssessment(assessmentId, clientId, {
        name,
        description,
        status,
        archived,
        tags,
        settings,
      });
      
      res.json(assessment);
    } catch (error: any) {
      console.error("[Routes] Error updating assessment:", error);
      res.status(500).json({ 
        error: "Failed to update assessment",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // Block routes
  adminRouter.get("/assessments/:assessmentId/blocks", async (req: any, res) => {
    try {
      const assessmentId = req.params.assessmentId;
      const blocks = await storage.getBlocks(assessmentId);
      res.json(blocks);
    } catch (error: any) {
      console.error("[Routes] Error fetching blocks:", error);
      res.status(500).json({ 
        error: "Failed to fetch blocks",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.post("/assessments/:assessmentId/blocks", async (req: any, res) => {
    try {
      const assessmentId = req.params.assessmentId;
      const { type, order, title, instructions, required, timeLimitSeconds, config, groupId } = req.body;
      
      const block = await storage.createBlock({
        assessmentId,
        type,
        order: order ?? undefined,
        title: title || "",
        instructions: instructions || "",
        required: required ?? false,
        timeLimitSeconds: timeLimitSeconds ?? undefined,
        config: config || {},
        groupId: groupId ?? undefined,
      });
      
      res.json(block);
    } catch (error: any) {
      console.error("[Routes] Error creating block:", error);
      res.status(500).json({ 
        error: "Failed to create block",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.put("/blocks/:id", async (req: any, res) => {
    try {
      const blockId = req.params.id;
      const { title, instructions, required, timeLimitSeconds, config, order, groupId } = req.body;
      
      const block = await storage.updateBlock(blockId, {
        title,
        instructions,
        required,
        timeLimitSeconds,
        config,
        order,
        groupId,
      });
      
      res.json(block);
    } catch (error: any) {
      console.error("[Routes] Error updating block:", error);
      res.status(500).json({ 
        error: "Failed to update block",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.delete("/blocks/:id", async (req: any, res) => {
    try {
      const blockId = req.params.id;
      await storage.deleteBlock(blockId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Routes] Error deleting block:", error);
      res.status(500).json({ 
        error: "Failed to delete block",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // Bulk update block order
  adminRouter.put("/assessments/:assessmentId/blocks/order", async (req: any, res) => {
    try {
      const assessmentId = req.params.assessmentId;
      const { blockIds } = req.body; // Array of block IDs in new order
      
      if (!Array.isArray(blockIds)) {
        return res.status(400).json({ error: "blockIds must be an array" });
      }
      
      await storage.updateBlockOrder(blockIds);
      const blocks = await storage.getBlocks(assessmentId);
      res.json(blocks);
    } catch (error: any) {
      console.error("[Routes] Error updating block order:", error);
      res.status(500).json({ 
        error: "Failed to update block order",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // Submission routes
  adminRouter.get("/assessments/:assessmentId/submissions", async (req: any, res) => {
    try {
      const assessmentId = req.params.assessmentId;
      const clientId = req.user.clientId;
      const submissions = await storage.getSubmissions(assessmentId, clientId);
      res.json(submissions);
    } catch (error: any) {
      console.error("[Routes] Error fetching submissions:", error);
      res.status(500).json({ 
        error: "Failed to fetch submissions",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // Get all submissions with assessment/project/campaign info
  adminRouter.get("/submissions", async (req: any, res) => {
    try {
      const clientId = req.user.clientId;
      console.log(`[Routes] Fetching all submissions for clientId: ${clientId}`);
      const submissions = await storage.getAllSubmissions(clientId);
      console.log(`[Routes] Returning ${submissions.length} submissions`);
      if (submissions.length > 0) {
        console.log(`[Routes] Sample submission structure:`, {
          hasAssessment: !!submissions[0].assessment,
          hasProject: !!submissions[0].assessment?.project,
          hasCampaign: !!submissions[0].assessment?.project?.campaign,
          assessmentName: submissions[0].assessment?.name,
          projectName: submissions[0].assessment?.project?.name,
          campaignName: submissions[0].assessment?.project?.campaign?.name,
        });
      }
      res.json(submissions);
    } catch (error: any) {
      console.error("[Routes] Error fetching all submissions:", error);
      console.error("[Routes] Error details:", {
        message: error?.message,
        stack: error?.stack,
      });
      res.status(500).json({ 
        error: "Failed to fetch submissions",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.get("/submissions/:id", async (req: any, res) => {
    try {
      const submissionId = req.params.id;
      const clientId = req.user.clientId;
      const submission = await storage.getSubmission(submissionId, clientId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      const responses = await storage.getBlockResponses(submissionId);
      res.json({ ...submission, responses });
    } catch (error: any) {
      console.error("[Routes] Error fetching submission:", error);
      res.status(500).json({ 
        error: "Failed to fetch submission",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.put("/submissions/:id", async (req: any, res) => {
    try {
      const submissionId = req.params.id;
      const clientId = req.user.clientId;
      const { reviewerNotes, totalScore, status } = req.body;
      
      const submission = await storage.updateAssessmentSubmission(submissionId, {
        reviewerNotes,
        totalScore,
        status,
      });
      res.json(submission);
    } catch (error: any) {
      console.error("[Routes] Error updating submission:", error);
      res.status(500).json({ 
        error: "Failed to update submission",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.put("/block-responses/:id", async (req: any, res) => {
    try {
      const responseId = req.params.id;
      const { score, reviewerFeedback } = req.body;
      
      const response = await storage.updateBlockResponse(responseId, {
        score,
        reviewerFeedback,
      });
      res.json(response);
    } catch (error: any) {
      console.error("[Routes] Error updating block response:", error);
      res.status(500).json({ 
        error: "Failed to update block response",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // Mount admin router
  app.use("/api/admin", adminRouter);
  
  // Debug: Log all registered admin routes
  console.log("[Routes] Registered admin routes:");
  adminRouter.stack.forEach((middleware: any) => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).join(',').toUpperCase();
      console.log(`[Routes]   ${methods} ${middleware.route.path}`);
    }
  });

  // =============================================================================
  // API KEY MANAGEMENT ROUTES (Admin)
  // =============================================================================

  adminRouter.get("/api-keys", async (req: any, res) => {
    try {
      const clientId = req.user.clientId;
      const keys = await storage.getApiKeys(clientId);
      // Don't return plain keys - they're only shown once on creation
      const sanitizedKeys = keys.map((key) => ({
        ...key,
        keyHash: undefined, // Don't expose hash
      }));
      res.json(sanitizedKeys);
    } catch (error: any) {
      console.error("[Routes] Error fetching API keys:", error);
      res.status(500).json({ 
        error: "Failed to fetch API keys",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.post("/api-keys", async (req: any, res) => {
    try {
      const clientId = req.user.clientId;
      const { name, permissions, webhookUrl, expiresAt } = req.body;

      const { apiKey, plainKey } = await storage.createApiKey({
        clientId,
        name: name || "Untitled API Key",
        permissions: Array.isArray(permissions) ? permissions : [],
        webhookUrl: webhookUrl || null,
        active: true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      // Return API key with plain key (only shown once)
      res.json({
        ...apiKey,
        keyHash: undefined, // Don't expose hash
        plainKey, // Only returned on creation
      });
    } catch (error: any) {
      console.error("[Routes] Error creating API key:", error);
      res.status(500).json({ 
        error: "Failed to create API key",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.get("/api-keys/:id", async (req: any, res) => {
    try {
      const clientId = req.user.clientId;
      const apiKey = await storage.getApiKey(req.params.id, clientId);
      if (!apiKey) {
        return res.status(404).json({ error: "API key not found" });
      }
      res.json({
        ...apiKey,
        keyHash: undefined, // Don't expose hash
      });
    } catch (error: any) {
      console.error("[Routes] Error fetching API key:", error);
      res.status(500).json({ 
        error: "Failed to fetch API key",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.put("/api-keys/:id", async (req: any, res) => {
    try {
      const clientId = req.user.clientId;
      const { name, permissions, webhookUrl, active, expiresAt } = req.body;

      const apiKey = await storage.updateApiKey(req.params.id, clientId, {
        name,
        permissions,
        webhookUrl,
        active,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });

      res.json({
        ...apiKey,
        keyHash: undefined, // Don't expose hash
      });
    } catch (error: any) {
      console.error("[Routes] Error updating API key:", error);
      res.status(500).json({ 
        error: "Failed to update API key",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.delete("/api-keys/:id", async (req: any, res) => {
    try {
      const clientId = req.user.clientId;
      await storage.deleteApiKey(req.params.id, clientId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Routes] Error deleting API key:", error);
      res.status(500).json({ 
        error: "Failed to delete API key",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  adminRouter.get("/api-keys/:id/webhooks", async (req: any, res) => {
    try {
      const clientId = req.user.clientId;
      const apiKey = await storage.getApiKey(req.params.id, clientId);
      if (!apiKey) {
        return res.status(404).json({ error: "API key not found" });
      }

      const events = await storage.getWebhookEvents(req.params.id, 100);
      res.json(events);
    } catch (error: any) {
      console.error("[Routes] Error fetching webhook events:", error);
      res.status(500).json({ 
        error: "Failed to fetch webhook events",
        details: process.env.NODE_ENV === "development" ? error?.message : undefined
      });
    }
  });

  // =============================================================================
  // N8N-COMPATIBLE API ROUTES (API Key Auth)
  // =============================================================================

  const apiRouter = Router();
  apiRouter.use(authenticateApiKey);

  // Get assessments
  apiRouter.get("/assessments", requirePermission("read:assessments"), async (req: any, res) => {
    try {
      const apiKey = req.apiKey;
      const assessments = await storage.getAllAssessments(apiKey.clientId);
      // Transform to n8n-compatible format
      res.json({
        data: assessments.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          publicUrl: a.publicUrl,
          status: a.status,
          projectId: a.projectId,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        })),
      });
    } catch (error: any) {
      console.error("[API] Error fetching assessments:", error);
      res.status(500).json({ error: "Failed to fetch assessments" });
    }
  });

  // Get submissions
  apiRouter.get("/submissions", requirePermission("read:submissions"), async (req: any, res) => {
    try {
      const apiKey = req.apiKey;
      const { assessmentId, status, limit = 100 } = req.query;
      
      let submissions = await storage.getAllSubmissions(apiKey.clientId);
      
      if (assessmentId) {
        submissions = submissions.filter((s) => s.assessmentId === assessmentId);
      }
      
      if (status) {
        submissions = submissions.filter((s) => s.status === status);
      }

      submissions = submissions.slice(0, parseInt(limit as string, 10));

      res.json({
        data: submissions.map((s) => ({
          id: s.id,
          assessmentId: s.assessmentId,
          email: s.email,
          firstName: s.firstName,
          lastName: s.lastName,
          status: s.status,
          progress: s.progress,
          totalScore: s.totalScore,
          maxScore: s.maxScore,
          submittedAt: s.submittedAt,
          createdAt: s.createdAt,
        })),
      });
    } catch (error: any) {
      console.error("[API] Error fetching submissions:", error);
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  });

  // Get single submission with responses
  apiRouter.get("/submissions/:id", requirePermission("read:submissions"), async (req: any, res) => {
    try {
      const apiKey = req.apiKey;
      const submission = await storage.getSubmission(req.params.id, apiKey.clientId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const responses = await storage.getBlockResponses(submission.id);
      const assessment = await storage.getAssessment(submission.assessmentId, apiKey.clientId);

      res.json({
        data: {
          ...submission,
          assessment,
          responses,
        },
      });
    } catch (error: any) {
      console.error("[API] Error fetching submission:", error);
      res.status(500).json({ error: "Failed to fetch submission" });
    }
  });

  // Update submission score (for AI grading)
  apiRouter.put("/submissions/:id/score", requirePermission("write:scores"), async (req: any, res) => {
    try {
      const apiKey = req.apiKey;
      const { totalScore, responses } = req.body;

      const submission = await storage.getSubmission(req.params.id, apiKey.clientId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      // Update submission total score
      if (totalScore !== undefined) {
        await storage.updateAssessmentSubmission(submission.id, {
          totalScore,
          status: "reviewed",
        });
      }

      // Update individual block response scores
      if (Array.isArray(responses)) {
        for (const response of responses) {
          if (response.id && response.score !== undefined) {
            await storage.updateBlockResponse(response.id, {
              score: response.score,
              autoGraded: true,
            });
          }
        }
      }

      const updatedSubmission = await storage.getSubmission(req.params.id, apiKey.clientId);
      const updatedResponses = await storage.getBlockResponses(submission.id);

      res.json({
        data: {
          ...updatedSubmission,
          responses: updatedResponses,
        },
      });
    } catch (error: any) {
      console.error("[API] Error updating submission score:", error);
      res.status(500).json({ error: "Failed to update submission score" });
    }
  });

  // Health check for API
  apiRouter.get("/health", async (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Mount API router
  app.use("/api/v1", apiRouter);

  console.log("[Routes] Registered n8n-compatible API routes at /api/v1");
}

