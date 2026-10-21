import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createApi, type Api } from "./client";
import type { Geometry } from "../model";

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

const defaultApi = createApi();

function useApi(): Api {
  return useContext(ApiContext) ?? defaultApi;
}

export const projectKey = ["project"] as const;

/** The server is the only source of truth: this is the one read of the whole project. */
export function useProject() {
  const api = useApi();
  return useQuery({ queryKey: projectKey, queryFn: () => api.getProject(), retry: false });
}

/** Keyed by `updatedAt` so an accepted edit re-measures. */
export function useMeasure(id: string, updatedAt: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: ["measure", id, updatedAt],
    queryFn: () => api.measure(id),
    enabled,
    retry: false,
  });
}

export function useCreateEntity() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; geometry: Geometry }) => api.createEntity(v.id, v.geometry),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKey }),
  });
}

export function useUpdateGeometry() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; geometry: Geometry; expectedRevision: number }) => api.updateGeometry(v.id, v.geometry, v.expectedRevision),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKey }),
  });
}

export function useDeleteEntity() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteEntity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKey }),
  });
}
