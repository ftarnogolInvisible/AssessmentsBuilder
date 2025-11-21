import { 
  campaigns,
  projects,
  assessments,
  blocks,
  assessmentSubmissions,
  blockResponses,
  apiKeys,
  webhookEvents,
  clients,
  users,
  type Campaign,
  type InsertCampaign,
  type Project,
  type InsertProject,
  type Assessment,
  type InsertAssessment,
  type Block,
  type InsertBlock,
  type AssessmentSubmission,
  type InsertAssessmentSubmission,
  type BlockResponse,
  type InsertBlockResponse,
  type ApiKey,
  type InsertApiKey,
  type WebhookEvent,
  type InsertWebhookEvent,
  type Client,
  type InsertClient,
} from "../shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, count } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export class Storage {
  // Utility method to clear all assessment data (for development)
  async clearAllAssessmentData(): Promise<void> {
    // Delete in order respecting foreign key constraints
    // Note: We DON'T delete clients table - that's needed for the dev client
    await db.execute(sql`TRUNCATE TABLE block_responses CASCADE`);
    await db.execute(sql`TRUNCATE TABLE assessment_submissions CASCADE`);
    await db.execute(sql`TRUNCATE TABLE blocks CASCADE`);
    await db.execute(sql`TRUNCATE TABLE assessments CASCADE`);
    await db.execute(sql`TRUNCATE TABLE projects CASCADE`);
    await db.execute(sql`TRUNCATE TABLE campaigns CASCADE`);
    // Clients table is NOT cleared - we need the dev client to remain
  }

  // Client methods
  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, id));
    return client || undefined;
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    try {
      const [client] = await db.insert(clients).values([insertClient]).returning();
      return client;
    } catch (error: any) {
      console.error("[Storage] Error creating client:", error);
      console.error("[Storage] Error details:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        constraint: error?.constraint,
        name: error?.name,
      });
      throw error;
    }
  }

  // Campaign methods
  async getCampaigns(clientId: string): Promise<Campaign[]> {
    return await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.clientId, clientId), eq(campaigns.archived, false)))
      .orderBy(desc(campaigns.updatedAt));
  }

  async getCampaign(id: string, clientId: string): Promise<Campaign | undefined> {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.clientId, clientId)));
    return campaign || undefined;
  }

  async createCampaign(insertCampaign: InsertCampaign): Promise<Campaign> {
    const campaignData = {
      ...insertCampaign,
      tags: Array.isArray(insertCampaign.tags) ? insertCampaign.tags : []
    } as InsertCampaign;
    
    try {
      const [campaign] = await db.insert(campaigns).values([campaignData]).returning();
      return campaign;
    } catch (error: any) {
      console.error("[Storage] Error creating campaign:", error);
      console.error("[Storage] Campaign data:", JSON.stringify(campaignData, null, 2));
      console.error("[Storage] Error details:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        constraint: error?.constraint,
        name: error?.name,
      });
      throw error;
    }
  }

  async updateCampaign(id: string, clientId: string, updateCampaign: Partial<InsertCampaign>): Promise<Campaign> {
    const campaignData = {
      ...updateCampaign,
      tags: updateCampaign.tags ? (Array.isArray(updateCampaign.tags) ? updateCampaign.tags : []) : undefined,
      updatedAt: new Date()
    } as Partial<InsertCampaign>;
    const [campaign] = await db
      .update(campaigns)
      .set(campaignData)
      .where(and(eq(campaigns.id, id), eq(campaigns.clientId, clientId)))
      .returning();
    return campaign;
  }

  async deleteCampaign(id: string, clientId: string): Promise<void> {
    await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.clientId, clientId)));
  }

  // Project methods
  async getProjects(campaignId: string, clientId: string): Promise<Project[]> {
    return await db
      .select()
      .from(projects)
      .where(and(eq(projects.campaignId, campaignId), eq(projects.clientId, clientId), eq(projects.archived, false)))
      .orderBy(desc(projects.updatedAt));
  }

  async getProject(id: string, clientId: string): Promise<Project | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.clientId, clientId)));
    return project || undefined;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const projectData = {
      ...insertProject,
      tags: Array.isArray(insertProject.tags) ? insertProject.tags : []
    } as InsertProject;
    const [project] = await db.insert(projects).values([projectData]).returning();
    return project;
  }

  async updateProject(id: string, clientId: string, updateProject: Partial<InsertProject>): Promise<Project> {
    const projectData = {
      ...updateProject,
      tags: updateProject.tags ? (Array.isArray(updateProject.tags) ? updateProject.tags : []) : undefined,
      updatedAt: new Date()
    } as Partial<InsertProject>;
    const [project] = await db
      .update(projects)
      .set(projectData)
      .where(and(eq(projects.id, id), eq(projects.clientId, clientId)))
      .returning();
    return project;
  }

  async deleteProject(id: string, clientId: string): Promise<void> {
    await db.delete(projects).where(and(eq(projects.id, id), eq(projects.clientId, clientId)));
  }

  // Assessment methods
  async getAssessments(projectId: string, clientId: string): Promise<Assessment[]> {
    return await db
      .select()
      .from(assessments)
      .where(and(eq(assessments.projectId, projectId), eq(assessments.clientId, clientId), eq(assessments.archived, false)))
      .orderBy(desc(assessments.updatedAt));
  }

  async getAssessment(id: string, clientId: string): Promise<Assessment | undefined> {
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(and(eq(assessments.id, id), eq(assessments.clientId, clientId)));
    return assessment || undefined;
  }

  async getAssessmentByPublicUrl(publicUrl: string): Promise<Assessment | undefined> {
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(and(eq(assessments.publicUrl, publicUrl), eq(assessments.status, "published")));
    return assessment || undefined;
  }

  async createAssessment(insertAssessment: InsertAssessment): Promise<Assessment> {
    const assessmentData = {
      ...insertAssessment,
      tags: Array.isArray(insertAssessment.tags) ? insertAssessment.tags : [],
      settings: insertAssessment.settings || {}
    } as InsertAssessment;
    const [assessment] = await db.insert(assessments).values([assessmentData]).returning();
    return assessment;
  }

  async updateAssessment(id: string, clientId: string, updateAssessment: Partial<InsertAssessment>): Promise<Assessment> {
    const assessmentData = {
      ...updateAssessment,
      tags: updateAssessment.tags ? (Array.isArray(updateAssessment.tags) ? updateAssessment.tags : []) : undefined,
      updatedAt: new Date()
    } as Partial<InsertAssessment>;
    const [assessment] = await db
      .update(assessments)
      .set(assessmentData)
      .where(and(eq(assessments.id, id), eq(assessments.clientId, clientId)))
      .returning();
    return assessment;
  }

  async deleteAssessment(id: string, clientId: string): Promise<void> {
    await db.delete(assessments).where(and(eq(assessments.id, id), eq(assessments.clientId, clientId)));
  }

  async publishAssessment(id: string, clientId: string): Promise<Assessment> {
    const assessment = await this.getAssessment(id, clientId);
    if (!assessment) throw new Error("Assessment not found");
    
    // Generate unique public URL if not already published
    const publicUrl = assessment.publicUrl || `assessment-${randomUUID().substring(0, 8)}`;
    
    const [published] = await db
      .update(assessments)
      .set({
        status: "published",
        publicUrl,
        publishedAt: assessment.publishedAt || new Date(),
        version: assessment.version + 1,
        updatedAt: new Date()
      })
      .where(and(eq(assessments.id, id), eq(assessments.clientId, clientId)))
      .returning();
    return published;
  }

  async unpublishAssessment(id: string, clientId: string): Promise<Assessment> {
    const assessment = await this.getAssessment(id, clientId);
    if (!assessment) throw new Error("Assessment not found");
    
    const [unpublished] = await db
      .update(assessments)
      .set({
        status: "draft",
        publicUrl: null, // Clear public URL to make it unavailable
        updatedAt: new Date()
      })
      .where(and(eq(assessments.id, id), eq(assessments.clientId, clientId)))
      .returning();
    return unpublished;
  }

  // Block methods
  async getBlocks(assessmentId: string): Promise<Block[]> {
    return await db
      .select()
      .from(blocks)
      .where(eq(blocks.assessmentId, assessmentId))
      .orderBy(asc(blocks.order));
  }

  async getBlock(id: string): Promise<Block | undefined> {
    const [block] = await db.select().from(blocks).where(eq(blocks.id, id));
    return block || undefined;
  }

  async createBlock(insertBlock: InsertBlock): Promise<Block> {
    // Get max order for this assessment
    const existingBlocks = await this.getBlocks(insertBlock.assessmentId);
    const maxOrder = existingBlocks.length > 0 ? Math.max(...existingBlocks.map(b => b.order)) : -1;
    
    const blockData = {
      ...insertBlock,
      order: insertBlock.order ?? maxOrder + 1,
      config: insertBlock.config || {}
    } as InsertBlock;
    const [block] = await db.insert(blocks).values([blockData]).returning();
    return block;
  }

  async updateBlock(id: string, updateBlock: Partial<InsertBlock>): Promise<Block> {
    const blockData = {
      ...updateBlock,
      updatedAt: new Date()
    } as Partial<InsertBlock>;
    const [block] = await db.update(blocks).set(blockData).where(eq(blocks.id, id)).returning();
    return block;
  }

  async deleteBlock(id: string): Promise<void> {
    await db.delete(blocks).where(eq(blocks.id, id));
  }

  async updateBlockOrder(blockIds: string[]): Promise<void> {
    // Update order for multiple blocks
    for (let i = 0; i < blockIds.length; i++) {
      await db.update(blocks)
        .set({ order: i, updatedAt: new Date() })
        .where(eq(blocks.id, blockIds[i]));
    }
  }

  // Assessment submission methods
  async createAssessmentSubmission(insertSubmission: InsertAssessmentSubmission): Promise<AssessmentSubmission> {
    const [submission] = await db.insert(assessmentSubmissions).values([insertSubmission]).returning();
    return submission;
  }

  async updateAssessmentSubmission(id: string, updateSubmission: Partial<InsertAssessmentSubmission>): Promise<AssessmentSubmission> {
    const submissionData = {
      ...updateSubmission,
      updatedAt: new Date()
    } as Partial<InsertAssessmentSubmission>;
    const [submission] = await db
      .update(assessmentSubmissions)
      .set(submissionData)
      .where(eq(assessmentSubmissions.id, id))
      .returning();
    return submission;
  }

  // Block response methods
  async createBlockResponse(insertResponse: InsertBlockResponse): Promise<BlockResponse> {
    const [response] = await db.insert(blockResponses).values([insertResponse]).returning();
    return response;
  }

  async updateBlockResponse(id: string, updateResponse: Partial<InsertBlockResponse>): Promise<BlockResponse> {
    const responseData = {
      ...updateResponse,
      updatedAt: new Date()
    } as Partial<InsertBlockResponse>;
    const [response] = await db
      .update(blockResponses)
      .set(responseData)
      .where(eq(blockResponses.id, id))
      .returning();
    return response;
  }

  async getSubmissions(assessmentId: string, clientId: string): Promise<AssessmentSubmission[]> {
    return await db
      .select()
      .from(assessmentSubmissions)
      .where(
        and(
          eq(assessmentSubmissions.assessmentId, assessmentId),
          eq(assessmentSubmissions.clientId, clientId)
        )
      )
      .orderBy(desc(assessmentSubmissions.createdAt));
  }

  async getAllSubmissions(clientId: string): Promise<Array<AssessmentSubmission & {
    assessment: Assessment & { project: Project & { campaign: Campaign } };
  }>> {
    console.log(`[Storage] Fetching all submissions for clientId: ${clientId}`);
    // Use SQL joins to fetch all data in one query
    const result = await db
      .select({
        // Submission fields
        submissionId: assessmentSubmissions.id,
        submissionAssessmentId: assessmentSubmissions.assessmentId,
        submissionClientId: assessmentSubmissions.clientId,
        submissionEmail: assessmentSubmissions.email,
        submissionFirstName: assessmentSubmissions.firstName,
        submissionLastName: assessmentSubmissions.lastName,
        submissionName: assessmentSubmissions.name,
        submissionStatus: assessmentSubmissions.status,
        submissionProgress: assessmentSubmissions.progress,
        submissionSubmittedAt: assessmentSubmissions.submittedAt,
        submissionReviewerNotes: assessmentSubmissions.reviewerNotes,
        submissionTotalScore: assessmentSubmissions.totalScore,
        submissionMaxScore: assessmentSubmissions.maxScore,
        submissionCreatedAt: assessmentSubmissions.createdAt,
        submissionUpdatedAt: assessmentSubmissions.updatedAt,
        // Assessment fields
        assessmentId: assessments.id,
        assessmentProjectId: assessments.projectId,
        assessmentName: assessments.name,
        assessmentDescription: assessments.description,
        assessmentStatus: assessments.status,
        assessmentPublicUrl: assessments.publicUrl,
        assessmentVersion: assessments.version,
        assessmentPublishedAt: assessments.publishedAt,
        assessmentArchived: assessments.archived,
        assessmentTags: assessments.tags,
        assessmentSettings: assessments.settings,
        assessmentCreatedAt: assessments.createdAt,
        assessmentUpdatedAt: assessments.updatedAt,
        // Project fields
        projectId: projects.id,
        projectCampaignId: projects.campaignId,
        projectName: projects.name,
        projectDescription: projects.description,
        projectArchived: projects.archived,
        projectTags: projects.tags,
        projectCreatedAt: projects.createdAt,
        projectUpdatedAt: projects.updatedAt,
        // Campaign fields
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        campaignDescription: campaigns.description,
        campaignArchived: campaigns.archived,
        campaignTags: campaigns.tags,
        campaignCreatedAt: campaigns.createdAt,
        campaignUpdatedAt: campaigns.updatedAt,
      })
      .from(assessmentSubmissions)
      .innerJoin(assessments, eq(assessmentSubmissions.assessmentId, assessments.id))
      .innerJoin(projects, eq(assessments.projectId, projects.id))
      .innerJoin(campaigns, eq(projects.campaignId, campaigns.id))
      .where(eq(assessmentSubmissions.clientId, clientId))
      .orderBy(desc(assessmentSubmissions.createdAt));

    console.log(`[Storage] Found ${result.length} submissions with joins`);

    // Transform the flat result into nested structure
    const transformed = result.map((row) => ({
      id: row.submissionId,
      assessmentId: row.submissionAssessmentId,
      clientId: row.submissionClientId,
      email: row.submissionEmail,
      firstName: row.submissionFirstName,
      lastName: row.submissionLastName,
      name: row.submissionName,
      status: row.submissionStatus,
      progress: row.submissionProgress,
      submittedAt: row.submissionSubmittedAt,
      reviewerNotes: row.submissionReviewerNotes,
      totalScore: row.submissionTotalScore,
      maxScore: row.submissionMaxScore,
      createdAt: row.submissionCreatedAt,
      updatedAt: row.submissionUpdatedAt,
      assessment: {
        id: row.assessmentId,
        projectId: row.assessmentProjectId,
        name: row.assessmentName,
        description: row.assessmentDescription,
        clientId: row.submissionClientId,
        status: row.assessmentStatus,
        publicUrl: row.assessmentPublicUrl,
        version: row.assessmentVersion,
        publishedAt: row.assessmentPublishedAt,
        archived: row.assessmentArchived,
        tags: row.assessmentTags,
        settings: row.assessmentSettings,
        createdAt: row.assessmentCreatedAt,
        updatedAt: row.assessmentUpdatedAt,
        project: {
          id: row.projectId,
          campaignId: row.projectCampaignId,
          name: row.projectName,
          description: row.projectDescription,
          clientId: row.submissionClientId,
          archived: row.projectArchived,
          tags: row.projectTags,
          createdAt: row.projectCreatedAt,
          updatedAt: row.projectUpdatedAt,
          campaign: {
            id: row.campaignId,
            name: row.campaignName,
            description: row.campaignDescription,
            clientId: row.submissionClientId,
            archived: row.campaignArchived,
            tags: row.campaignTags,
            createdAt: row.campaignCreatedAt,
            updatedAt: row.campaignUpdatedAt,
          },
        },
      },
    })) as Array<AssessmentSubmission & {
      assessment: Assessment & { project: Project & { campaign: Campaign } };
    }>;

    console.log(`[Storage] Transformed ${transformed.length} submissions`);
    if (transformed.length > 0) {
      console.log(`[Storage] Sample submission:`, {
        id: transformed[0].id,
        assessmentName: transformed[0].assessment?.name,
        projectName: transformed[0].assessment?.project?.name,
        campaignName: transformed[0].assessment?.project?.campaign?.name,
      });
    }

    return transformed;
  }

  async getSubmission(id: string, clientId: string): Promise<AssessmentSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(assessmentSubmissions)
      .where(
        and(
          eq(assessmentSubmissions.id, id),
          eq(assessmentSubmissions.clientId, clientId)
        )
      );
    return submission || undefined;
  }

  async getBlockResponses(submissionId: string): Promise<BlockResponse[]> {
    return await db
      .select()
      .from(blockResponses)
      .where(eq(blockResponses.submissionId, submissionId))
      .orderBy(asc(blockResponses.createdAt));
  }
}

export const storage = new Storage();

