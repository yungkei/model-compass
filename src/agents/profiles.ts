/**
 * Agent Profiles - Model Compass owned adapter state
 *
 * Everything MC needs to launch an agent through its proxy lives here, under
 * ~/.model-compass. Nothing is ever written into the target application's own
 * configuration directory unless the user explicitly passes `--global`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getMcConfigDir } from './launch';

export interface AgentProfile {
  id: string;
  name: string;
  type: string;
  description: string;
  version: string;
  /** Environment variables applied to the spawned child process */
  env?: Record<string, string>;
  /** Extra CLI arguments applied to the spawned child process */
  args?: string[];
  /** Whether the target application's own config file was modified */
  globalApplied: boolean;
  /** Paths of the third-party config files that were written (global mode) */
  globalFiles?: string[];
  installedAt: number;
}

function getProfileDir(): string {
  return path.join(getMcConfigDir(), 'profiles');
}

function getProfilePath(id: string): string {
  return path.join(getProfileDir(), `${id}.json`);
}

export function loadProfile(id: string): AgentProfile | undefined {
  const filePath = getProfilePath(id);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AgentProfile;
    }
  } catch {
    // ignore malformed profiles
  }
  return undefined;
}

export function saveProfile(profile: AgentProfile): void {
  const dir = getProfileDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getProfilePath(profile.id), JSON.stringify(profile, null, 2));
}

export function removeProfile(id: string): boolean {
  const filePath = getProfilePath(id);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function listProfiles(): AgentProfile[] {
  const dir = getProfileDir();
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as AgentProfile;
        } catch {
          return undefined;
        }
      })
      .filter((p): p is AgentProfile => Boolean(p));
  } catch {
    return [];
  }
}
