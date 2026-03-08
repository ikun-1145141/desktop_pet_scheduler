/* =============================================
   API Client - 与后端 Router 对接
   ============================================= */

import type {
  ScheduleEvent,
  TodoItem,
  TodoStats,
  Live2DModelInfo,
  CreateScheduleParams,
  CreateTodoParams,
  ApiResponse,
} from '../types';

const BASE = '/api/pet-scheduler';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new Error(`Network error: ${path}`);
  }
  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch { /* ignore */ }
    throw new Error((body as ApiResponse).error ?? `HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${path}`);
  }
}

/* ---- Schedule ---- */

export async function getSchedules(date?: string): Promise<ScheduleEvent[]> {
  const q = date ? `?date=${date}` : '';
  const r = await request<ApiResponse<ScheduleEvent[]>>(`/schedules${q}`);
  return r.data ?? [];
}

export async function createSchedule(params: CreateScheduleParams): Promise<ScheduleEvent> {
  const r = await request<ApiResponse<ScheduleEvent>>('/schedules', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return r.data!;
}

export async function deleteSchedule(id: string): Promise<void> {
  await request<ApiResponse>(`/schedules?id=${id}`, { method: 'DELETE' });
}

/* ---- Todo ---- */

export async function getTodos(status?: string): Promise<TodoItem[]> {
  const q = status ? `?status=${status}` : '';
  const r = await request<ApiResponse<TodoItem[]>>(`/todos${q}`);
  return r.data ?? [];
}

export async function createTodo(params: CreateTodoParams): Promise<TodoItem> {
  const r = await request<ApiResponse<TodoItem>>('/todos', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return r.data!;
}

export async function toggleTodo(id: string): Promise<TodoItem> {
  const r = await request<ApiResponse<TodoItem>>(`/todos/toggle?id=${id}`, { method: 'PATCH' });
  return r.data!;
}

export async function deleteTodo(id: string): Promise<void> {
  await request<ApiResponse>(`/todos?id=${id}`, { method: 'DELETE' });
}

export async function getTodoStats(): Promise<TodoStats> {
  const r = await request<ApiResponse<TodoStats>>('/todos/stats');
  return r.data!;
}

/* ---- Live2D ---- */

export async function getLive2DModels(): Promise<Live2DModelInfo[]> {
  const r = await request<ApiResponse<Live2DModelInfo[]>>('/live2d/models');
  return r.data ?? [];
}

export async function getActiveLive2DModel(): Promise<Live2DModelInfo | null> {
  const r = await request<ApiResponse<Live2DModelInfo>>('/live2d/active');
  return r.data ?? null;
}

export async function switchLive2DModel(modelId: string): Promise<void> {
  await request<ApiResponse>(`/live2d/switch/${encodeURIComponent(modelId)}`, {
    method: 'POST',
  });
}

export async function scanLive2DModels(): Promise<Live2DModelInfo[]> {
  const r = await request<ApiResponse<Live2DModelInfo[]>>('/live2d/scan', { method: 'POST' });
  return r.data ?? [];
}

/* ---- Health ---- */

export async function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health');
}
