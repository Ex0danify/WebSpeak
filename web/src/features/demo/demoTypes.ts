export interface DemoMessage { id: number; author: string; time: string; text: string; zhText?: string; enText?: string; ruText?: string; jaText?: string; mine: boolean }
export interface DemoMember { id: string; name: string }
export interface DemoChannel { id: string; name: string; members: DemoMember[] }
export type DemoTab = "channel" | "server";
