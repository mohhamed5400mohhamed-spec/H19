import type { ChatShortcut } from './chatShortcuts';
import type { EmblemsConfig } from './emblemsSystem';
import type { MembershipDesignCatalog } from '../constants/membershipDesigns';
import type { RoleDefinition, StoryItem, WallPost } from '../types/chat';

const DELTA_CACHE_STORAGE_KEY = 'chathassan_delta_cache_v1';

export interface ClientConfigVersions {
  emblems?: string;
  shortcuts?: string;
  roles?: string;
  appearance?: string;
  wall?: string;
  stories?: string;
  membershipCatalog?: string;
}

export interface ClientCachedAppearance {
  theme?: string;
  fontFamily?: string;
  fontWeight?: 'thin' | 'normal' | 'default' | 'bold' | 'black';
  wallpaper?: string;
  bubbleStyle?: string;
  bannerUrl?: string;
  logoUrl?: string;
  customThemes?: any[];
}

export interface ClientDeltaCacheState {
  versions: ClientConfigVersions;
  data: {
    emblemsConfig?: EmblemsConfig;
    shortcuts?: ChatShortcut[];
    rolesConfig?: RoleDefinition[];
    rolePermissions?: Record<string, any>;
    globalAppearance?: ClientCachedAppearance;
    generalWelcome?: { enabled: boolean; message: string; title: string };
    likesSettings?: any;
    wallPosts?: WallPost[];
    stories?: StoryItem[];
    membershipDesignCatalog?: MembershipDesignCatalog;
  };
  updatedAt: number;
}

let inMemoryDeltaCache: ClientDeltaCacheState | null = null;

const MAX_INLINE_DATA_URI_LEN = 16384;
const MAX_DELTA_STORAGE_BYTES = 240 * 1024;

function stripLargeDataUri(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('data:') && url.length > MAX_INLINE_DATA_URI_LEN) {
    return undefined;
  }
  return url;
}

function sanitizeWallPostsForCache(posts: WallPost[], limit = 25): WallPost[] {
  return posts.slice(0, limit).map((post) => ({
    ...post,
    mediaUrl: stripLargeDataUri(post.mediaUrl),
    userAvatar: stripLargeDataUri((post as any).userAvatar)
  }));
}

function sanitizeStoriesForCache(stories: StoryItem[], limit = 15): StoryItem[] {
  return stories.slice(0, limit).map((story) => ({
    ...story,
    mediaUrl: stripLargeDataUri(story.mediaUrl) || '',
    avatarUrl: stripLargeDataUri(story.avatarUrl)
  }));
}

function buildCompactStorageCopy(state: ClientDeltaCacheState): ClientDeltaCacheState {
  const safeAppearance = state.data.globalAppearance
    ? {
        ...state.data.globalAppearance,
        wallpaper: stripLargeDataUri(state.data.globalAppearance.wallpaper),
        bannerUrl: stripLargeDataUri(state.data.globalAppearance.bannerUrl),
        logoUrl: stripLargeDataUri(state.data.globalAppearance.logoUrl)
      }
    : undefined;

  const safeEmblems = state.data.emblemsConfig
    ? {
        ...state.data.emblemsConfig,
        falconChatBanner: stripLargeDataUri(state.data.emblemsConfig.falconChatBanner),
        falconAvatarIcon: stripLargeDataUri(state.data.emblemsConfig.falconAvatarIcon),
        items: Array.isArray(state.data.emblemsConfig.items)
          ? state.data.emblemsConfig.items.map((item) => ({
              ...item,
              imageUrl: stripLargeDataUri(item.imageUrl) || ''
            }))
          : []
      }
    : undefined;

  const safeMembershipCatalog = state.data.membershipDesignCatalog
    ? {
        customFrames: Array.isArray(state.data.membershipDesignCatalog.customFrames)
          ? state.data.membershipDesignCatalog.customFrames
              .map((item) => ({ ...item, imageUrl: stripLargeDataUri(item.imageUrl) || '' }))
              .filter((item) => Boolean(item.imageUrl))
          : [],
        customBgs: Array.isArray(state.data.membershipDesignCatalog.customBgs)
          ? state.data.membershipDesignCatalog.customBgs
              .map((item) => ({ ...item, imageUrl: stripLargeDataUri(item.imageUrl) || '' }))
              .filter((item) => Boolean(item.imageUrl))
          : [],
        deletedPresetFrameIds: Array.isArray(state.data.membershipDesignCatalog.deletedPresetFrameIds)
          ? state.data.membershipDesignCatalog.deletedPresetFrameIds
          : [],
        deletedPresetBgIds: Array.isArray(state.data.membershipDesignCatalog.deletedPresetBgIds)
          ? state.data.membershipDesignCatalog.deletedPresetBgIds
          : []
      }
    : undefined;

  return {
    ...state,
    data: {
      ...state.data,
      globalAppearance: safeAppearance,
      emblemsConfig: safeEmblems,
      membershipDesignCatalog: safeMembershipCatalog,
      wallPosts: state.data.wallPosts ? sanitizeWallPostsForCache(state.data.wallPosts, 25) : undefined,
      stories: state.data.stories ? sanitizeStoriesForCache(state.data.stories, 15) : undefined
    }
  };
}

export function readDeltaCache(): ClientDeltaCacheState {
  if (inMemoryDeltaCache) return inMemoryDeltaCache;
  const empty: ClientDeltaCacheState = { versions: {}, data: {}, updatedAt: 0 };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(DELTA_CACHE_STORAGE_KEY);
    if (!raw) {
      inMemoryDeltaCache = empty;
      return empty;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      inMemoryDeltaCache = {
        versions: parsed.versions && typeof parsed.versions === 'object' ? parsed.versions : {},
        data: parsed.data && typeof parsed.data === 'object' ? parsed.data : {},
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
      };
      return inMemoryDeltaCache;
    }
  } catch {}
  inMemoryDeltaCache = empty;
  return empty;
}

export function getCachedVersions(): ClientConfigVersions {
  return { ...readDeltaCache().versions };
}

export function saveDeltaCachePatch(patch: {
  versions?: Partial<ClientConfigVersions>;
  data?: Partial<ClientDeltaCacheState['data']>;
}): ClientDeltaCacheState {
  const current = readDeltaCache();
  const nextData: ClientDeltaCacheState['data'] = {
    ...current.data,
    ...(patch.data || {})
  };
  if (patch.data?.wallPosts) {
    nextData.wallPosts = sanitizeWallPostsForCache(patch.data.wallPosts, 25);
  }
  if (patch.data?.stories) {
    nextData.stories = sanitizeStoriesForCache(patch.data.stories, 15);
  }
  const next: ClientDeltaCacheState = {
    versions: {
      ...current.versions,
      ...(patch.versions || {})
    },
    data: nextData,
    updatedAt: Date.now()
  };
  inMemoryDeltaCache = next;

  if (typeof window !== 'undefined') {
    const persistable = buildCompactStorageCopy(next);
    try {
      const serialized = JSON.stringify(persistable);
      if (serialized.length <= MAX_DELTA_STORAGE_BYTES) {
        localStorage.setItem(DELTA_CACHE_STORAGE_KEY, serialized);
        return next;
      }
    } catch {}

    // Fallback when over byte budget or QuotaExceededError: drop bulky wallPosts/stories from persistent storage
    try {
      const trimmed: ClientDeltaCacheState = {
        ...persistable,
        data: {
          ...persistable.data,
          wallPosts: persistable.data.wallPosts ? sanitizeWallPostsForCache(persistable.data.wallPosts, 10) : undefined,
          stories: persistable.data.stories ? sanitizeStoriesForCache(persistable.data.stories, 6) : undefined
        }
      };
      let serializedTrimmed = JSON.stringify(trimmed);
      if (serializedTrimmed.length > MAX_DELTA_STORAGE_BYTES) {
        trimmed.data.wallPosts = undefined;
        trimmed.data.stories = undefined;
        serializedTrimmed = JSON.stringify(trimmed);
      }
      localStorage.setItem(DELTA_CACHE_STORAGE_KEY, serializedTrimmed);
    } catch {}
  }
  return next;
}
