/**
 * Exponential API Client
 * Handles authenticated requests to the Exponential API
 */

const DEFAULT_BASE_URL = 'https://www.exponential.im';

export interface ExponentialConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  priority: string;
  progress: number;
}

export interface Action {
  id: string;
  name: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  projectId?: string;
  project?: { name: string };
}

export interface Goal {
  id: number;
  title: string;
  description?: string;
  period?: string;
  keyResults: KeyResult[];
}

export interface KeyResult {
  id: string;
  title: string;
  targetValue?: number;
  currentValue?: number;
  status: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
}

export class ExponentialAPI {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ExponentialConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Exponential API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  // tRPC-style calls
  private async trpcQuery<T>(procedure: string, input?: any): Promise<T> {
    const inputStr = input ? encodeURIComponent(JSON.stringify(input)) : '';
    const url = `/api/trpc/${procedure}${inputStr ? `?input=${inputStr}` : ''}`;
    return this.request<{ result: { data: T } }>(url).then(r => r.result.data);
  }

  private async trpcMutation<T>(procedure: string, input: any): Promise<T> {
    const url = `/api/trpc/${procedure}`;
    return this.request<{ result: { data: T } }>(url, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(r => r.result.data);
  }

  // === Workspace ===
  
  async getWorkspaces(): Promise<Workspace[]> {
    return this.trpcQuery<Workspace[]>('workspace.list');
  }

  // === Projects ===

  async getProjects(workspaceId?: string): Promise<Project[]> {
    return this.trpcQuery<Project[]>('project.list', { workspaceId });
  }

  async getProject(id: string): Promise<Project> {
    return this.trpcQuery<Project>('project.get', { id });
  }

  // === Actions ===

  async getActions(params?: { projectId?: string; status?: string }): Promise<Action[]> {
    return this.trpcQuery<Action[]>('action.list', params);
  }

  async createAction(data: {
    name: string;
    description?: string;
    projectId?: string;
    priority?: string;
    dueDate?: string;
  }): Promise<Action> {
    return this.trpcMutation<Action>('action.create', data);
  }

  async updateAction(id: string, data: {
    name?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
  }): Promise<Action> {
    return this.trpcMutation<Action>('action.update', { id, ...data });
  }

  async completeAction(id: string): Promise<Action> {
    return this.updateAction(id, { status: 'COMPLETED' });
  }

  // === Goals (OKRs) ===

  async getGoals(workspaceId?: string): Promise<Goal[]> {
    return this.trpcQuery<Goal[]>('goal.list', { workspaceId });
  }

  async getGoal(id: number): Promise<Goal> {
    return this.trpcQuery<Goal>('goal.get', { id });
  }

  // === Quick Actions ===

  async quickCreateAction(text: string): Promise<Action> {
    // Uses natural language parsing (dates, project names, etc.)
    return this.trpcMutation<Action>('action.quickCreate', { text });
  }

  // === Search ===

  async search(query: string): Promise<{ projects: Project[]; actions: Action[]; goals: Goal[] }> {
    return this.trpcQuery('search.global', { query });
  }
}
