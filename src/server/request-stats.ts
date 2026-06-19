export const requestStats = {
  total: 0,
  success: 0,
  failed: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  recent: [] as Array<{ time: string; type: string; model: string; success: boolean }>
};
