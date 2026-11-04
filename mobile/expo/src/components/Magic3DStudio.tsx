/**
 * Magic3DStudio.tsx
 * ---------------------------------------------------------------------------
 * Single-file React Native + TypeScript + Expo prototype that turns ONE product
 * photo into a cinematic 3D "film" or a live-camera AR overlay.
 *
 *   Product Photo -> (mock) background removal -> (mock) 4 views -> (mock) depth
 *   -> ProductAsset -> AI Scene Planner -> SceneSpec -> FIXED renderer
 *   -> Three.js / React Three Fiber -> Film Studio OR Camera Studio
 *
 * FLOW:
 *   Film Studio   : product photo + scene description -> Meta Model cloud API -> a full
 *                   self-contained Three.js HTML page -> shown in a sandboxed
 *                   WebView (react-native-webview, included in Expo Go).
 *                   The product views are injected as window.__MAGIC3D__ so
 *                   preset scenes (Livingroom, ...) can texture them.
 *                   MOCK mode returns the bundled assets/html/demo.html.
 *   Camera Studio : unchanged - SceneSpec + fixed React Three Fiber renderer
 *                   over the live expo-camera feed.
 *
 * SECURITY: cloud HTML is untrusted code. It only ever runs inside the WebView:
 * injected CSP (CDN allow-list, no other network), navigation blocked, no file
 * access, and a typed one-way message bridge. It never touches React Native.
 * The SceneSpec path (validateSceneSpec) is still used for Camera Studio and
 * for the offline fallback preview.
 *
 * REQUIRED PACKAGES (all work in Expo Go / simulator):
 *   npx expo install expo-image-picker expo-camera expo-linear-gradient expo-blur expo-sensors expo-asset expo-secure-store
 *     expo-gl @shopify/react-native-skia @shopify/flash-list react-native-webview expo-sqlite
 *     react-native-safe-area-context @expo/vector-icons
 *   npm i three @react-three/fiber @types/three
 *   OPTIONAL (development build, not Expo Go): npx expo install react-native-view-recorder | react-native-view-shot  (3D snapshot sent with a Retouch when backend 'istakesnapshotforretouch' is true)
 *   (expo-three / drei are optional here: textures are built from Skia pixels
 *    and procedural DataTextures, so no loaders or remote assets are needed.)
 *
 * OPTIONAL (production, loaded lazily - the app boots without them):
 *   expo-turbo-screen-recorder, react-native-purchases (RevenueCat)
 *
 * Metro note: the lazy requires below sit inside try/catch, which Metro treats
 * as optional dependencies. If your Metro config disables that, keep the
 * packages installed.
 *
 * File map:
 *   1. Types
 *   2. Constants (mode flag, capabilities, themes)
 *   3. Utilities
 *   4. Skia helpers + procedural demo product
 *   5. Mock AI services / real stubs / Services facade / pipeline
 *   6. SceneSpec defaults, validation, mock planner
 *   8. 3D building blocks (textures, environments, lighting, product)
 *   9. Animation engine + camera rig registry
 *  10. Effects engine
 *  11. Film Studio
 *  12. Camera Studio
 *  13. UI components
 *  14. Main screen
 */

//Release 1.9.9 Android & iOS Wed 4th 2026 

import { Ionicons } from '@expo/vector-icons';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { FlashList } from '@shopify/flash-list';
import {
  AlphaType,
  BlendMode,
  BlurStyle,
  ColorType,
  FilterMode,
  ImageFormat,
  MipmapMode,
  PaintStyle,
  Skia,
  TileMode,
  type SkCanvas,
  type SkImage,
} from '@shopify/react-native-skia';
import { generateClient } from 'aws-amplify/api';
import { getProperties, getUrl, uploadData } from 'aws-amplify/storage';
import { Asset } from 'expo-asset';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Box as CubeIcon, FileArchive, FileText, Share2, Sparkles as SparkIcon, X as XIcon } from 'lucide-react-native';
import React, {
  createContext,
  memo,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  GestureResponderEvent,
  Image,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TurboModuleRegistry,
  useWindowDimensions,
  View,
  ViewStyle
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Carousel } from 'react-native-reanimated-carousel';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as THREE from 'three';
import { create_zip_from_files, removeBackground_Native_v2, writeToFile } from './utils/helpers';

// Generated by Amplify (amplify codegen). Adjust the path if your graphql folder lives elsewhere. 
import { createLogDetail, createUserSettings, updateUserSettings } from '../graphql/mutations';
import { listMagicStudioSettings, listUserSettings } from '../graphql/queries';

/* ============================================================================
 * 1. TYPES
 * ========================================================================== */

type ViewLabel = 'front' | 'back' | 'left' | 'right';
const VIEW_ORDER: ViewLabel[] = ['front', 'left', 'right', 'back'];

type ProductView = { imageUri: string; depthUri?: string; label: ViewLabel };
type ProductViews = Record<ViewLabel, ProductView>;
type DepthMaps = Record<ViewLabel, string>;

type ProductMetadata = {
  category: 'shoe' | 'bag' | 'motorbike' | 'generic';
  name: string;
  dominantColors: string[];
  aspectRatio: number; // width / height of the clean image
  suggestedScale: number;
  materials: string[];
  description: string;
};

/** ProductAsset = rendering assets (images + depth). NOT scene intent. */
type ProductAsset = {
  id: string;
  originalImageUri: string;
  cleanImageUri: string;
  maskUri?: string;
  views: ProductViews;
  metadata: ProductMetadata;
};

// `(string & {})` keeps literal autocomplete but lets us register hundreds of ids later.
type EnvironmentId = 'modern_living_room' | 'studio' | 'minimal' | 'luxury' | 'cyberpunk' | (string & {});
type AnimationId = 'none' | 'rotate' | 'float' | 'bounce' | 'float_rotate' | (string & {});
type CameraMoveId = 'static' | 'orbit' | 'push_in' | 'pull_out' | 'cinematic_orbit' | (string & {});
type LightingId = 'soft_studio' | 'dramatic' | 'luxury' | 'neon' | (string & {});
type Vec3 = [number, number, number];

type CameraBackground = {
  invert?: boolean;
  grayscale?: boolean;
  blur?: number; // 0..1
  sepia?: boolean;
  pencil?: boolean;
  neon?: boolean;
};

type SceneSpec = {
  version: 1;
  mode: 'film' | 'camera';
  environment: {
    type: EnvironmentId;
    table?: { enabled: boolean; style?: string; height?: number };
    floor?: { enabled: boolean; type?: string; reflectivity?: number };
  };
  product: { position: Vec3; rotation: Vec3; scale: number };
  animation: {
    type: AnimationId;
    duration: number;
    rotation?: { axis: 'x' | 'y' | 'z'; speed: number };
    float?: { amplitude: number; frequency: number };
  };
  camera: { type: CameraMoveId; duration: number; distance: number; height: number; fov: number };
  lighting: { preset: LightingId; keyIntensity: number; rimIntensity: number };
  effects: { bloom: number; fog: number; depthOfField: number; particles: boolean; vignette: boolean };
  /** Camera Studio only: post-effects applied to the live frames. */
  cameraBackground?: CameraBackground;
  /** Camera Studio extras: product-level motion effects. */
  productEffects?: { wind: number; wave: number; antiGravity: boolean; /** ids from MOTION_EFFECTS */ motions?: string[] };
  render: { duration: number; fps: number };
};

type FilmStudioCapabilities = {
  environments: string[];
  cameraTypes: string[];
  animations: string[];
  lightingPresets: string[];
  effects: string[];
  cameraBackgroundEffects: string[];
};

type GlobalMode = 'MOCK' | 'PRODUCTION';

type PlatformSpec = { name: string; width: number; height: number };
type PlatformBackground =
  | { kind: 'color'; color: string }
  | { kind: 'image'; uri: string };
type PlatformImage = { name: string; dimension: string; uri: string };

type Theme = {
  id: string;
  name: string;
  dark: boolean;
  bg: [string, string, string];
  text: string;
  textMuted: string;
  surface: string;
  border: string;
  primary: string;
  accent: string;
  success: string;
  danger: string;
  cardFilm: [string, string];
  cardCamera: [string, string];
  cardPick: [string, string];
  cardTake: [string, string];
  cta: [string, string];
  tintFilm: string;
  tintCamera: string;
  tintPick: string;
  tintTake: string;
  stageBg: [string, string];
  /** Rich 6-colour palette: [primary, accent, c3, c4, c5, c6] - hues spread around the wheel, every one readable under white labels. */
  palette: [string, string, string, string, string, string];
  /** Colour of each guided step: Photo, Scene, Result (the progress ribbon blends from one to the next). */
  steps: [string, string, string];
  /** Third / fourth palette colours by role, for section icons, badges and chips. */
  tertiary: string;
  quaternary: string;
  /** Warm sparkle colour (replaces the hard-coded golds); lifted for dark themes. */
  highlight: string;
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ============================================================================
 * 2. CONSTANTS
 * ========================================================================== */

// LayoutAnimation (used for the guided-flow step change) needs this switch on old-architecture Android.
if (Platform.OS === 'android') {
  try {
    (require('react-native').UIManager as any)?.setLayoutAnimationEnabledExperimental?.(true);
  } catch {
    /* new architecture: already on */
  }
}

/** Flip to 'PRODUCTION' once the real* functions below are implemented. */
const GLOBAL_MODE: GlobalMode = 'MOCK' as GlobalMode;

/** Feature flags. Flip to true when the feature is ready. */
const SHOW_PROFILE_AVATAR = false; // person avatar in the header (profile / sign-in pending)
/** MOCK mode only: show the RevenueCat top-up modal. PRODUCTION reads 'showrevenuecat' from the backend (default false = the "credits reset tomorrow" sheet). */
const MOCK_SHOW_REVENUECAT = false;
/**
 * Test switches: run the PRODUCTION branch even while GLOBAL_MODE is 'MOCK' (Expo Go testing against the real backend). They have NO effect in PRODUCTION mode (it is always real there).
 *   ENABLE_TEST_REAL_CREDIT: read / write the user credit and read the global default credit through AWS Amplify (AppSync).
 *   ENABLE_TEST_REAL_UPLOAD: upload the photo + prompt to storage.
 *   ENABLE_TEST_REAL_DOWNLOAD: check storage for the generated .html / angle images and download them (needs the upload to
 *   have really happened, so turn ENABLE_TEST_REAL_UPLOAD on too; with it off, the files never appear and the timeout shows).
 * The same two flags also drive Harmonize (Camera Studio):
 *   UPLOAD=false, DOWNLOAD=false -> fully mocked (local colour grade, no network)
 *   UPLOAD=true,  DOWNLOAD=false -> really uploads the snapshot + prompt, then returns the mock grade (tests the upload only)
 *   UPLOAD=false, DOWNLOAD=true  -> nothing is uploaded, storage is polled for the result (expect the 30 s timeout)
 *   UPLOAD=true,  DOWNLOAD=true  -> the full real round trip (what PRODUCTION always does)
 * Keep both false for normal MOCK runs.
 */
/** The ENABLE_TEST_* switches below are read ONLY in MOCK mode: in PRODUCTION every one of them is forced off (PRODUCTION always runs the real code and real images). */
const TEST_FLAGS_ENABLED = GLOBAL_MODE === ('MOCK' as GlobalMode);
const ENABLE_TEST_REAL_CREDIT = TEST_FLAGS_ENABLED && true;
const ENABLE_TEST_REAL_UPLOAD = TEST_FLAGS_ENABLED && false;
const ENABLE_TEST_REAL_DOWNLOAD = TEST_FLAGS_ENABLED && false;
/** MOCK mode only: run the real native background removal on picked photos (needs a build with the native module, not Expo Go). */
const ENABLE_TEST_REAL_REMOVE_BG = TEST_FLAGS_ENABLED && false;
/** true when the photo's REAL cut-out is used everywhere (upload, 3D page, platform images): PRODUCTION, or MOCK with ENABLE_TEST_REAL_REMOVE_BG. Otherwise MOCK uses the bundled demo shoe. */
const useRealForeground = () => GLOBAL_MODE !== 'MOCK' || ENABLE_TEST_REAL_REMOVE_BG;
/** How long to wait for a generated IMAGE to appear in storage and download before showing "not available". */
const CLOUD_FILE_TIMEOUT_MS = 120_000;
/** How long to wait for the generated 3D scene page (the slow part of a generation). */
const CLOUD_SCENE_TIMEOUT_MS = 120_000;
/** How long the upload of the photo + prompt may take before it is reported as failed. */
const UPLOAD_TIMEOUT_MS = 68_000;
/** MOCK mode: also use the bundled scene image and the front view as the cut-out (the 4 demo views are always the bundled PNGs). */
const USE_BUNDLED_MOCK_IMAGES = TEST_FLAGS_ENABLED && true;

/** Sandbox settings for cloud-generated HTML (see ScenePreview). */
const SCENE_BASE_URL = 'https://magic3d.app.invalid/';
const SCENE_LOAD_TIMEOUT_MS = 25000;
/** CDN allow-list + no other network. Set false if a page is blank and you need to debug. */
const PREVIEW_CSP_ENABLED = true;
/**
 * Post processing for the generated 3D pages (glow / bloom today, more effects later).
 * PREVIEW_POST_FX is only the DEFAULT of the "Post Processing" setting (Settings sheet, saved on the phone).
 * Compatibility: the setting reaches a page only as window.__MAGIC3D__.post (+ postFxOff), and only pages made with the newer cookbook
 * (they contain POST_FX_PAGE_MARKER) read it. Older generated html ignores it, is not reloaded when it changes and renders exactly as before.
 */
const PREVIEW_POST_FX = false;
const POST_FX_PAGE_MARKER = 'm3d-post';
const POST_FX_STORE_KEY = 'post_fx_v1';
/** The effects the Settings sheet lists under Post Processing. Add one here (and read its id in the cookbook) to offer another. */
const POST_FX_EFFECTS: { id: string; label: string; caption: string; icon: IconName }[] = [
  { id: 'bloom', label: 'Glow', caption: 'Soft halo on bright light', icon: 'bulb-outline' },
];
type PostFxSettings = { enabled: boolean; off: string[] };
let postFxSettings: PostFxSettings = { enabled: PREVIEW_POST_FX, off: [] };
const postFxListeners = new Set<() => void>();
function setPostFxSettings(next: Partial<PostFxSettings>) {
  postFxSettings = { ...postFxSettings, ...next };
  postFxListeners.forEach((f) => f());
  void kvSet(POST_FX_STORE_KEY, JSON.stringify(postFxSettings));
}
/** Reads the saved setting once at start (a missing or broken value keeps the default). */
async function loadPostFxSettings() {
  try {
    const raw = await kvGet(POST_FX_STORE_KEY);
    if (!raw) return;
    const j = JSON.parse(raw);
    postFxSettings = {
      enabled: typeof j?.enabled === 'boolean' ? j.enabled : PREVIEW_POST_FX,
      off: Array.isArray(j?.off) ? j.off.filter((x: unknown): x is string => typeof x === 'string') : [],
    };
    postFxListeners.forEach((f) => f());
  } catch {}
}
/** True while a screen / canvas recording is starting or running: the page hides its own on-screen controls (elements marked data-m3d-ui, e.g. the FX pill) so they never appear in the video. */
let sceneRecording = false;
const sceneRecordingListeners = new Set<() => void>();
function setSceneRecording(on: boolean) {
  if (sceneRecording === on) return;
  sceneRecording = on;
  sceneRecordingListeners.forEach((f) => f());
}
function useSceneRecording(): boolean {
  const [v, setV] = useState(sceneRecording);
  useEffect(() => {
    const f = () => setV(sceneRecording);
    sceneRecordingListeners.add(f);
    f();
    return () => {
      sceneRecordingListeners.delete(f);
    };
  }, []);
  return v;
}
function usePostFxSettings(): PostFxSettings {
  const [v, setV] = useState(postFxSettings);
  useEffect(() => {
    const f = () => setV(postFxSettings);
    postFxListeners.add(f);
    f();
    return () => {
      postFxListeners.delete(f);
    };
  }, []);
  return v;
}
const PREVIEW_CSP =
  "default-src 'none'; " +
  "script-src 'unsafe-inline' 'unsafe-eval' blob: https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
  'connect-src https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com data: blob:; ' +
  'img-src data: blob:; media-src data: blob:; style-src \'unsafe-inline\'; font-src data:; worker-src blob:; ' +
  "child-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

const DEMO_PRODUCT_URI = 'demo://procedural-shoe';
const DEMO_PROMPT = 'This product floating on a nice table in a beautiful modern living room.';
const MAX_TEX = 768; // sensible texture resolution
const MAX_DEPTH_TEX = 384;

/** Contract exposed to the LLM. (No renderer source code is ever sent.) */
const FILM_STUDIO_CAPABILITIES: FilmStudioCapabilities = {
  environments: ['modern_living_room', 'studio', 'minimal', 'luxury', 'cyberpunk'],
  cameraTypes: ['static', 'orbit', 'push_in', 'pull_out', 'cinematic_orbit'],
  animations: ['rotate', 'float', 'bounce', 'float_rotate'],
  lightingPresets: ['soft_studio', 'dramatic', 'luxury', 'neon'],
  effects: ['bloom', 'fog', 'depth_of_field', 'particles', 'vignette'],
  cameraBackgroundEffects: ['invert', 'grayscale', 'blur', 'sepia', 'pencil', 'neon'],
};

const SCENE_PRESETS: { label: string; prompt: string }[] = [
  { label: 'Living room', prompt: DEMO_PROMPT },
  { label: 'Luxury', prompt: 'A luxury dark pedestal with gold light, slow rotating shoe, dramatic lighting and sparkles.' },
  { label: 'Cyberpunk', prompt: 'Cyberpunk neon city vibe, fast rotating shoe floating with glow and particles.' },
  { label: 'Studio', prompt: 'Clean white studio, shoe bouncing gently, static camera, soft lighting.' },
];

const DEFAULT_PLATFORM_SPEC =
  'name=Facebook;dimension=1080x1080,name=Amazon;dimension=1024x2688,name=Instagram Story;dimension=1080x1920,name=Shopify;dimension=2048x2048';

const BG_SWATCHES = ['#FFFFFF', '#bf8f4f', '#DDE9FF', '#e081ca', '#D8F3E4', '#a449a7'];

/* ---------- Themes (data-driven; add hundreds via registerThemes) ----------
 * 100 curated presets: 80 light + 20 dark. Every preset goes through defineTheme(), which keeps the palette usable:
 *   - primary / accent / CTA stops are fitted to a luminance window so the white labels, check marks and icons the app
 *     draws on them stay readable (light themes: deeper, calmer tones; dark themes: lifted mid-tones, never neon).
 *   - text, muted text, borders and the 3D stage backdrop are tinted from the palette instead of one fixed grey/blue.
 *   - the Film / Camera / Pick / Take card tints are derived as a harmonious split around the primary hue.
 */

const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v: number) => Math.round(255 * v).toString(16).padStart(2, '0');
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`;
};

const hexToRgbTuple = (hex: string): [number, number, number] => {
  const h = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** [hue 0-360, saturation 0-100, lightness 0-100] */
const hexToHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgbTuple(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s * 100, l * 100];
};
/** WCAG relative luminance, 0 (black) .. 1 (white). */
const relLum = (hex: string): number => {
  const [r, g, b] = hexToRgbTuple(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastRatio = (a: string, b: string): number => {
  const x = relLum(a);
  const y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Keeps hue + saturation, moves lightness until the luminance sits inside [lo, hi]. A colour already inside is returned untouched. */
const fitLum = (hex: string, lo: number, hi: number): string => {
  const L = relLum(hex);
  const eps = 0.004;
  if (L >= lo - eps && L <= hi + eps) return hex;
  const [h, s] = hexToHsl(hex);
  const target = L < lo ? lo : hi;
  let a = 0;
  let b = 100;
  for (let i = 0; i < 24; i++) {
    const m = (a + b) / 2;
    if (relLum(hslToHex(h, s, m)) < target) a = m;
    else b = m;
  }
  return hslToHex(h, s, (a + b) / 2);
};
const mixHex = (a: string, b: string, t: number): string => {
  const x = hexToRgbTuple(a);
  const y = hexToRgbTuple(b);
  const v = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return `#${v(0)}${v(1)}${v(2)}`;
};
const hueDist = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
};

function defineTheme(p: {
  id: string;
  name: string;
  dark?: boolean;
  bg: [string, string, string];
  primary: string;
  accent: string;
  cta: [string, string];
  tints?: Partial<Pick<Theme, 'tintFilm' | 'tintCamera' | 'tintPick' | 'tintTake'>>;
}): Theme {
  const dark = !!p.dark;
  // Readability window: white labels / check marks sit on these colours all over the app.
  const primary = dark ? fitLum(p.primary, 0.2, 0.34) : fitLum(p.primary, 0.04, 0.22);
  const accent = dark ? fitLum(p.accent, 0.18, 0.36) : fitLum(p.accent, 0.05, 0.32);
  const cta = p.cta.map((c) => (dark ? fitLum(c, 0.1, 0.29) : fitLum(c, 0.06, 0.29))) as [string, string];

  const [ph, ps] = hexToHsl(primary);
  const [ah, asat] = hexToHsl(accent);
  const [bh] = hexToHsl(p.bg[1]);

  // Card tints: split around the primary hue, kept apart from primary/accent and from each other.
  const sat = Math.max(24, Math.min(66, (ps + asat) / 2));
  const pickHue = (base: number, avoid: number[]) => {
    let h = (base + 360) % 360;
    for (let i = 0; i < 12 && avoid.some((a) => hueDist(a, h) < 28); i++) h = (h + 30) % 360;
    return h;
  };
  const camH = pickHue(ph + 60, [ph, ah]);
  const takeH = pickHue(ph - 60, [ph, ah, camH]);
  const tint = (h: number) => fitLum(hslToHex(h, sat, 55), dark ? 0.2 : 0.1, dark ? 0.4 : 0.34);
  const tintFilm = p.tints?.tintFilm ?? primary;
  const tintCamera = p.tints?.tintCamera ?? tint(camH);
  const tintPick = p.tints?.tintPick ?? accent;
  const tintTake = p.tints?.tintTake ?? tint(takeH);
  const soft = (c: string) => [hexToRgba(c, dark ? 0.22 : 0.16), hexToRgba(c, dark ? 0.08 : 0.05)] as [string, string];

  // ---- Rich palette: primary + accent + four more hues, each as far from the others as the wheel allows. ----
  // Neutral themes (slate, mono, greige...) keep a gentle, low-saturation spread so they stay calm.
  const neutral = ps < 18 && asat < 22;
  const palSat = neutral ? (ps < 6 ? 12 : 22) : Math.max(36, Math.min(56, (ps + asat) / 2));
  const chosen: number[] = [ph, ah];
  const extras: { h: number; col: string }[] = [];
  const base = neutral ? bh : ph;
  for (let k = 0; k < 4; k++) {
    let bestH = base;
    let bestD = -1;
    for (let i = 0; i < 24; i++) {
      const h = (base + i * 15) % 360;
      const d = Math.min(...chosen.map((c) => hueDist(c, h)));
      if (d > bestD) {
        bestD = d;
        bestH = h;
      }
    }
    chosen.push(bestH);
    const lt = (dark ? 64 : 50) + (k % 2 ? 4 : -2); // alternate lightness so neighbours never look identical
    extras.push({ h: bestH, col: fitLum(hslToHex(bestH, palSat, lt), dark ? 0.2 : 0.07, dark ? 0.38 : 0.3) });
  }
  // Nearest hues first: slots 3-4 are the harmonious neighbours, slots 5-6 the contrasting pops.
  extras.sort((x, y) => hueDist(x.h, ph) - hueDist(y.h, ph));
  const extra = extras.map((e) => e.col);
  const palette = [primary, accent, extra[0], extra[1], extra[2], extra[3]] as Theme['palette'];
  // Photo -> Scene -> Result: an analogous walk around the wheel from the primary, heading toward the accent's side,
  // so the ribbon reads as one smooth gradient with three clearly different steps (never a jump to an unrelated hue).
  const dir = ((ah - ph + 540) % 360) - 180 >= 0 ? 1 : -1;
  const [, , pl] = hexToHsl(primary);
  const stepSat = neutral ? palSat : Math.max(40, Math.min(70, ps));
  const stepAt = (deg: number) => fitLum(hslToHex((ph + dir * deg + 360) % 360, stepSat, pl), dark ? 0.2 : 0.06, dark ? 0.38 : 0.3);
  const steps = [primary, stepAt(48), stepAt(96)] as Theme['steps'];
  const highlight = dark ? '#FFD36B' : '#E8A317';

  // Ink tinted toward the palette (neutral primaries borrow the background's hue).
  const inkH = ps < 15 ? bh : ph;
  const text = dark ? hslToHex(inkH, 35, 96) : hslToHex(inkH, 30, 11);
  const textMuted = dark ? hslToHex(inkH, 16, 70) : hslToHex(inkH, 14, 38);

  return {
    id: p.id,
    name: p.name,
    dark,
    bg: p.bg,
    text,
    textMuted,
    surface: dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.88)',
    border: dark ? 'rgba(255,255,255,0.11)' : hexToRgba(text, 0.08),
    primary,
    accent,
    success: dark ? '#3DD68C' : '#1FA971',
    danger: dark ? '#FF6B6B' : '#E5484D',
    cardFilm: soft(tintFilm),
    cardCamera: soft(tintCamera),
    cardPick: soft(tintPick),
    cardTake: soft(tintTake),
    cta,
    tintFilm,
    tintCamera,
    tintPick,
    tintTake,
    palette,
    steps,
    tertiary: extra[0],
    quaternary: extra[1],
    highlight,
    // 3D stage backdrop follows the palette (it used to be one fixed blue/peach for every light theme).
    stageBg: dark ? [mixHex(p.bg[1], primary, 0.06), mixHex(p.bg[0], '#000000', 0.3)] : [mixHex(p.bg[1], primary, 0.08), mixHex(p.bg[2], accent, 0.1)],
  };
}

/** Generate a full, calm theme from one hue - the path to "hundreds of themes". */
function themeFromHue(id: string, name: string, hue: number, dark = false): Theme {
  const h2 = (hue + 40) % 360;
  return defineTheme({
    id,
    name,
    dark,
    bg: dark
      ? [hslToHex(hue, 34, 11), hslToHex(hue, 32, 15), hslToHex((hue + 25) % 360, 30, 20)]
      : [hslToHex(hue, 100, 98), hslToHex(hue, 70, 95), hslToHex((hue + 30) % 360, 70, 95)],
    primary: hslToHex(hue, dark ? 62 : 60, dark ? 62 : 42),
    accent: hslToHex(h2, 55, dark ? 66 : 52),
    cta: [hslToHex(hue, 62, 48), hslToHex(h2, 58, 52)],
  });
}

/** Theme used on first launch (and whenever a saved id is unknown). */
const DEFAULT_THEME_ID = 'ivory_archive';
const THEME_REGISTRY: Record<string, Theme> = {};
function registerThemes(list: Theme[]) {
  list.forEach((t) => (THEME_REGISTRY[t.id] = t));
}
registerThemes([
  // ---- 11 bright new presets (Ivory Archive is the default theme) ----
  defineTheme({ id: 'ivory_archive', name: 'Ivory Archive', bg: ['#FCF9F2', '#F5F0E6', '#FFFFFF'], primary: '#7A5638', accent: '#C08A3E', cta: ['#8E6544', '#C28634'] }),
  defineTheme({ id: 'blush_peony', name: 'Blush Peony', bg: ['#FFF5F9', '#FFE8F1', '#FFF6EE'], primary: '#D4608A', accent: '#F09A6B', cta: ['#E0709A', '#EE8E5C'] }),
  defineTheme({ id: 'sunset_coral', name: 'Sunset Coral', bg: ['#FFF6F1', '#FFE6DA', '#FFF1E0'], primary: '#E5603A', accent: '#F2A03A', cta: ['#EE7448', '#E8932E'] }),
  defineTheme({ id: 'emerald_forest', name: 'Emerald Forest', bg: ['#F1FAF4', '#DEF3E6', '#F4F8E8'], primary: '#1F9457', accent: '#C9A227', cta: ['#2DAA6A', '#C09A22'] }),
  defineTheme({ id: 'golden_hour', name: 'Golden Hour', bg: ['#FFFAEC', '#FFEFC9', '#FFE9DA'], primary: '#D9961E', accent: '#E8643C', cta: ['#E8A826', '#E5683F'] }),
  defineTheme({ id: 'aquamarine', name: 'Aquamarine', bg: ['#EFFCF8', '#D9F6EE', '#EAF6FD'], primary: '#1FA383', accent: '#3D9BDC', cta: ['#2DB896', '#3A93D6'] }),
  defineTheme({ id: 'tangerine_fizz', name: 'Tangerine Fizz', bg: ['#FFF7EE', '#FFE9D2', '#FFF0F2'], primary: '#F07818', accent: '#E8407A', cta: ['#F58A2C', '#E8507F'] }),
  defineTheme({ id: 'electric_violet', name: 'Electric Violet', bg: ['#F8F3FF', '#EDE2FF', '#FFF0FA'], primary: '#8A3FEA', accent: '#EC4FA8', cta: ['#9B55F2', '#EC5FB0'] }),
  defineTheme({ id: 'turquoise_bay', name: 'Turquoise Bay', bg: ['#EEFBFD', '#D6F3F8', '#FFF6E8'], primary: '#0FA2B8', accent: '#F5A623', cta: ['#18B7CE', '#F0A020'] }),
  defineTheme({ id: 'strawberry_milk', name: 'Strawberry Milk', bg: ['#FFF4F6', '#FFE3EA', '#F6F0FF'], primary: '#E5385F', accent: '#A678EE', cta: ['#EE4D72', '#A07AEA'] }),
  defineTheme({ id: 'mojito_lime', name: 'Mojito Lime', bg: ['#F6FDEA', '#E6F7C8', '#E9FAF3'], primary: '#4DA81F', accent: '#14B8A6', cta: ['#5FBF2C', '#18AE9E'] }),
  // ---- 80 light presets ----
  defineTheme({ id: 'aurora', name: 'Aurora', bg: ['#F5F8FF', '#EBF1FF', '#F6F1FF'], primary: '#3F74DD', accent: '#8477E5', cta: ['#6793E2', '#8477E5'] }),
  defineTheme({ id: 'sky_cotton', name: 'Sky Cotton', bg: ['#F3FAFF', '#E6F4FD', '#F1F7FF'], primary: '#2388C9', accent: '#3DA2D9', cta: ['#369BD9', '#2E9BD8'] }),
  defineTheme({ id: 'ice_blue', name: 'Ice Blue', bg: ['#F5F9FD', '#E8F0F9', '#F0F4FB'], primary: '#2B64A8', accent: '#699DD5', cta: ['#3A78C2', '#5A96D7'] }),
  defineTheme({ id: 'periwinkle', name: 'Cornflower Butter', bg: ['#F5F7FF', '#E9EEFF', '#FFF9E8'], primary: '#4660C8', accent: '#BC9524', cta: ['#5873D8', '#B38D22'] }),
  defineTheme({ id: 'cobalt_air', name: 'Cobalt Air', bg: ['#FBFCFF', '#F1F5FF', '#F7FAFF'], primary: '#2552D1', accent: '#2494BA', cta: ['#376AD9', '#289BCF'] }),
  defineTheme({ id: 'glacier', name: 'Glacier', bg: ['#F1FBFD', '#E1F4F8', '#EBF6FB'], primary: '#166B7A', accent: '#29A8BF', cta: ['#1D8396', '#28A0B7'] }),
  defineTheme({ id: 'denim', name: 'Denim', bg: ['#F6F7FA', '#EBEEF4', '#F3F1F0'], primary: '#33557F', accent: '#7A9CC5', cta: ['#46689A', '#7494C0'] }),
  defineTheme({ id: 'powder', name: 'Powder Blue', bg: ['#F4F9FD', '#E9F2FA', '#FFF4EE'], primary: '#4577AD', accent: '#DC835E', cta: ['#5C8FC4', '#DA7851'] }),
  defineTheme({ id: 'harbor', name: 'Harbor Navy', bg: ['#F7F9FC', '#ECF0F7', '#F5F3EE'], primary: '#1F3A68', accent: '#C0923F', cta: ['#2E4E85', '#B78C3C'] }),
  defineTheme({ id: 'seafoam', name: 'Seafoam', bg: ['#F0FBFA', '#DFF5F4', '#EBF8F3'], primary: '#178085', accent: '#35AAA2', cta: ['#1F9EA2', '#31A399'] }),
  defineTheme({ id: 'mint_gelato', name: 'Mint Gelato', bg: ['#F2FCF7', '#E1F7EC', '#EEFBF3'], primary: '#178463', accent: '#2FAD7E', cta: ['#20A57C', '#2AA678'] }),
  defineTheme({ id: 'aqua_pop', name: 'Aqua Pop', bg: ['#F1FBFC', '#E2F5F8', '#FFF3EF'], primary: '#1A8491', accent: '#E27D65', cta: ['#209AA7', '#DF7456'] }),
  defineTheme({ id: 'lagoon', name: 'Lagoon', bg: ['#EFFAF8', '#DDF2EF', '#F0F8EC'], primary: '#16757E', accent: '#42AE64', cta: ['#1D9099', '#3EA669'] }),
  defineTheme({ id: 'pine_peach', name: 'Pine & Peach', bg: ['#F3F9F6', '#E4F0EA', '#FFF3EC'], primary: '#2F6F5E', accent: '#DF8158', cta: ['#3F8470', '#DC784C'] }),
  defineTheme({ id: 'mint', name: 'Spearmint', bg: ['#F3FCF6', '#E4F7EA', '#F6FBEA'], primary: '#1B9266', accent: '#7CA724', cta: ['#25A675', '#70A028'] }),
  defineTheme({ id: 'pool_party', name: 'Pool Party', bg: ['#EFFAFE', '#DDF3FB', '#FFF8E8'], primary: '#1D86A2', accent: '#CC8D27', cta: ['#249FC0', '#C28725'] }),
  defineTheme({ id: 'tidepool', name: 'Tidepool', bg: ['#F2F8F8', '#E4EEEE', '#F8F3EA'], primary: '#1A737C', accent: '#D28938', cta: ['#2A8A94', '#CD812E'] }),
  defineTheme({ id: 'sage', name: 'Sage', bg: ['#F5F8F3', '#E9F0E6', '#F3F4EA'], primary: '#4F7B62', accent: '#77A57B', cta: ['#628F74', '#66A06A'] }),
  defineTheme({ id: 'matcha', name: 'Matcha', bg: ['#F6FAEC', '#EAF3D8', '#F8F6E4'], primary: '#587F26', accent: '#87A43A', cta: ['#6C9A30', '#809D35'] }),
  defineTheme({ id: 'eucalyptus', name: 'Eucalyptus', bg: ['#F2F7F7', '#E3EDEE', '#EEF3F3'], primary: '#4A7C84', accent: '#5EA59F', cta: ['#5C919A', '#599F9C'] }),
  defineTheme({ id: 'olive_grove', name: 'Olive Grove', bg: ['#F8F8EE', '#EEEFD9', '#F7F2E6'], primary: '#6B7425', accent: '#C0794F', cta: ['#818B2F', '#C68356'] }),
  defineTheme({ id: 'honeydew', name: 'Honeydew', bg: ['#F2FCF3', '#E3F7E6', '#F4FAE9'], primary: '#299351', accent: '#50AE3D', cta: ['#36A660', '#4CA637'] }),
  defineTheme({ id: 'pine_mist', name: 'Pine Mist', bg: ['#F1F6F0', '#E1EDE0', '#F0F3E6'], primary: '#2F6B45', accent: '#85A45E', cta: ['#3E8056', '#7A9D5D'] }),
  defineTheme({ id: 'lime_soda', name: 'Lime Soda', bg: ['#F8FDEB', '#EEF9D2', '#F3FBE6'], primary: '#508B19', accent: '#B59722', cta: ['#5FA11F', '#AA9222'] }),
  defineTheme({ id: 'lemonade', name: 'Lemonade', bg: ['#FFFDEC', '#FFF8CF', '#FFF4E0'], primary: '#8F6F19', accent: '#BA9524', cta: ['#AA8520', '#B28E22'] }),
  defineTheme({ id: 'saffron', name: 'Saffron', bg: ['#FFF9EA', '#FFF0CC', '#FFEBD8'], primary: '#9D661C', accent: '#D08B28', cta: ['#B97A23', '#C78426'] }),
  defineTheme({ id: 'apricot', name: 'Apricot', bg: ['#FFF8F0', '#FFEDD9', '#FFEBE3'], primary: '#BB6E26', accent: '#E37C6D', cta: ['#D77C29', '#E17261'] }),
  defineTheme({ id: 'marigold', name: 'Marigold', bg: ['#FFFAEC', '#FFF1CF', '#F2F1FF'], primary: '#A8781D', accent: '#6F7DE0', cta: ['#BE8924', '#848AE7'] }),
  defineTheme({ id: 'walnut_sky', name: 'Walnut Sky', bg: ['#FAF5EE', '#F1E5D4', '#EDF4F8'], primary: '#7A5230', accent: '#5BA0CE', cta: ['#8F643F', '#5799C8'] }),
  defineTheme({ id: 'cocoa_mint', name: 'Cocoa Mint', bg: ['#FAF6F2', '#F1E8E0', '#EEF7F3'], primary: '#6B4A3A', accent: '#49AA8A', cta: ['#7F5C4A', '#4FA186'] }),
  defineTheme({ id: 'berry_mint', name: 'Berry Mint', bg: ['#FFF4F8', '#FBE6EF', '#EDF9F4'], primary: '#A82E6E', accent: '#37AB8B', cta: ['#BC4482', '#36A484'] }),
  defineTheme({ id: 'poppy', name: 'Poppy Red', bg: ['#FFF6F3', '#FFE7E1', '#FFF1E4'], primary: '#C0362C', accent: '#D98632', cta: ['#D24A3C', '#DA7A3F'] }),
  defineTheme({ id: 'sakura', name: 'Sakura', bg: ['#FFF6F9', '#FFE9F1', '#FFF4F0'], primary: '#D44A82', accent: '#E5769C', cta: ['#E0629A', '#E36A93'] }),
  defineTheme({ id: 'rose_quartz', name: 'Rose Quartz', bg: ['#FAF3F5', '#F2E3E8', '#F5EDF0'], primary: '#A8506E', accent: '#C18A9B', cta: ['#B96482', '#C28094'] }),
  defineTheme({ id: 'bubblegum', name: 'Bubblegum', bg: ['#FFF3F9', '#FFE5F2', '#F5EEFF'], primary: '#D6338A', accent: '#A785E8', cta: ['#DD4D9A', '#A47FE7'] }),
  defineTheme({ id: 'cotton_candy', name: 'Cotton Candy', bg: ['#FFF5FB', '#F5EEFF', '#EBF6FF'], primary: '#D84B98', accent: '#699BE3', cta: ['#E267AD', '#5E94E0'] }),
  defineTheme({ id: 'cherry_cream', name: 'Cherry Cream', bg: ['#FFF7F5', '#FFE9E6', '#FFF2F2'], primary: '#BE2F57', accent: '#E67A7A', cta: ['#CE4468', '#E46F6F'] }),
  defineTheme({ id: 'peach_fuzz', name: 'Peach Fuzz', bg: ['#FFF7F1', '#FFE8DA', '#FFF1EA'], primary: '#D25F2A', accent: '#DD8350', cta: ['#DC7647', '#DB7842'] }),
  defineTheme({ id: 'coral', name: 'Coral Reef', bg: ['#FFF5F2', '#FFE8E3', '#EFF9F8'], primary: '#D9473F', accent: '#1E9C92', cta: ['#E16A60', '#E0735C'] }),
  defineTheme({ id: 'terracotta', name: 'Terracotta', bg: ['#FCF4EE', '#F6E5D8', '#F3E3D6'], primary: '#B04E2B', accent: '#D1885D', cta: ['#C2603B', '#CD8050'] }),
  defineTheme({ id: 'rose_gold', name: 'Rose Gold', bg: ['#FFF6F3', '#F9E8E3', '#F6EAE6'], primary: '#B06D58', accent: '#D38768', cta: ['#C2806B', '#D07E5D'] }),
  defineTheme({ id: 'watermelon', name: 'Watermelon', bg: ['#FFF4F6', '#FFE6EB', '#F0FBF4'], primary: '#D63A5E', accent: '#44AB79', cta: ['#DC486A', '#E36E85'] }),
  defineTheme({ id: 'raspberry', name: 'Raspberry Sorbet', bg: ['#FFF4F8', '#FFE6F0', '#F9EFFA'], primary: '#A31D6A', accent: '#E574AC', cta: ['#BC2F7E', '#E368A6'] }),
  defineTheme({ id: 'lavender_mist', name: 'Lavender Mist', bg: ['#F8F5FF', '#EEE8FF', '#F6F0FB'], primary: '#7157CF', accent: '#A18CE9', cta: ['#8368DB', '#9A84E7'] }),
  defineTheme({ id: 'cranberry_frost', name: 'Cranberry Frost', bg: ['#FFF6F7', '#F8E6EA', '#F2F6FB'], primary: '#A3264F', accent: '#719CD4', cta: ['#B83A62', '#6796D1'] }),
  defineTheme({ id: 'orchid', name: 'Orchid', bg: ['#FDF4FF', '#F7E6FF', '#FFF0F7'], primary: '#A936C9', accent: '#E070CC', cta: ['#BB4ED6', '#DD65C9'] }),
  defineTheme({ id: 'royal', name: 'Royal Purple', bg: ['#F7F3FF', '#EDE5FF', '#F3F0FF'], primary: '#5F35D6', accent: '#B086E7', cta: ['#774FDE', '#A480E7'] }),
  defineTheme({ id: 'grape_soda', name: 'Grape Soda', bg: ['#F9F4FD', '#F0E4F9', '#FBEFF6'], primary: '#7B3AAE', accent: '#E473AF', cta: ['#8F4EC0', '#E268A9'] }),
  defineTheme({ id: 'fuchsia_sky', name: 'Fuchsia Sky', bg: ['#FEF4FB', '#F8E6F5', '#EEF6FE'], primary: '#B8309A', accent: '#4CA0DD', cta: ['#C846AC', '#3E9ADA'] }),
  defineTheme({ id: 'mauve', name: 'Mauve', bg: ['#FAF5F8', '#F2E6EE', '#F6EEF1'], primary: '#8E5584', accent: '#C486B5', cta: ['#A0689A', '#C07DB0'] }),
  defineTheme({ id: 'thistle', name: 'Thistle', bg: ['#F8F6FB', '#EDE8F4', '#F4F1F7'], primary: '#7A5F9E', accent: '#A98EC7', cta: ['#8D72B0', '#A387C3'] }),
  defineTheme({ id: 'plum_cream', name: 'Aubergine Gold', bg: ['#FBF4F8', '#F3E3EE', '#FBF3E6'], primary: '#6A2D63', accent: '#C78F28', cta: ['#7F4078', '#BF8926'] }),
  defineTheme({ id: 'cloud_dancer', name: 'Cloud Dancer', bg: ['#FDFCFA', '#F5F3EF', '#F8F6F3'], primary: '#3F4654', accent: '#B08A5A', cta: ['#4B5262', '#8A8F9C'] }),
  defineTheme({ id: 'mocha_mousse', name: 'Mocha Mousse', bg: ['#FBF6F1', '#F3E8DF', '#EFE2D7'], primary: '#7B5442', accent: '#B58B72', cta: ['#8E624C', '#B48A70'] }),
  defineTheme({ id: 'oat_milk', name: 'Oat Milk', bg: ['#FBF8F2', '#F2EBDD', '#F6F0E4'], primary: '#7D6A4A', accent: '#B29665', cta: ['#917B58', '#AD8F5A'] }),
  defineTheme({ id: 'pearl', name: 'Pearl', bg: ['#FBFBFD', '#F1F2F6', '#F6F5FA'], primary: '#566075', accent: '#8E9AB1', cta: ['#6B768C', '#8793AC'] }),
  defineTheme({ id: 'greige', name: 'Greige', bg: ['#F6F6F2', '#EAEAE3', '#F1F1EA'], primary: '#5F6558', accent: '#979C83', cta: ['#737A6A', '#90957B'] }),
  defineTheme({ id: 'taupe', name: 'Soft Taupe', bg: ['#F7F4F2', '#ECE6E3', '#F2EEEC'], primary: '#6E5A57', accent: '#AE948F', cta: ['#806B68', '#A98C88'] }),
  defineTheme({ id: 'sandstone', name: 'Sandstone', bg: ['#FBF6EE', '#F2E8D6', '#F0E4CF'], primary: '#9A6B3E', accent: '#C48F4F', cta: ['#B07D4C', '#C08841'] }),
  defineTheme({ id: 'dune', name: 'Desert Dune', bg: ['#FFF8EB', '#FBEBD3', '#F9E3CC'], primary: '#AE591F', accent: '#D78730', cta: ['#C56C2D', '#CF8028'] }),
  defineTheme({ id: 'slate', name: 'Slate', bg: ['#F5F7FA', '#EBEEF4', '#F1F3F8'], primary: '#2F3B52', accent: '#64748B', cta: ['#3E4C66', '#7A889F'] }),
  defineTheme({ id: 'mono', name: 'Mono', bg: ['#FAFAFA', '#F2F2F2', '#ECECEC'], primary: '#383838', accent: '#525252', cta: ['#454545', '#5C5C5C'] }),
  defineTheme({ id: 'smoky_lilac', name: 'Smoky Lilac', bg: ['#F6F5F8', '#EAE8EF', '#F3F1F6'], primary: '#5A5568', accent: '#A094B5', cta: ['#6D6880', '#9A8CB0'] }),
  defineTheme({ id: 'forest_cream', name: 'Forest Cream', bg: ['#FAF8F1', '#F0EEDF', '#F4F1E6'], primary: '#2E5E4E', accent: '#BE9342', cta: ['#3C7360', '#B68B3E'] }),
  defineTheme({ id: 'burgundy_cream', name: 'Burgundy Cream', bg: ['#FBF6F3', '#F3E7E2', '#F7EFEA'], primary: '#7D2E45', accent: '#BE9061', cta: ['#963F58', '#BA8957'] }),
  defineTheme({ id: 'sunset', name: 'Sunset', bg: ['#FFF6EF', '#FFEBE0', '#FFE9F0'], primary: '#D65526', accent: '#DA3E77', cta: ['#DB7243', '#DE4F81'] }),
  defineTheme({ id: 'dopamine', name: 'Dopamine Pop', bg: ['#F7F3FF', '#EEE9FF', '#FFF1F6'], primary: '#7356E1', accent: '#E475A4', cta: ['#866EE3', '#E36A9F'] }),
  defineTheme({ id: 'y2k_aqua', name: 'Y2K Aqua', bg: ['#F0FBFF', '#E4F4FF', '#F6F0FF'], primary: '#1E86AA', accent: '#9E77E5', cta: ['#269EC8', '#A180E7'] }),
  defineTheme({ id: 'holo', name: 'Holographic', bg: ['#F5F6FF', '#EAF6F9', '#FBF1FA'], primary: '#5C6CE0', accent: '#2AAC97', cta: ['#7985E6', '#2FA490'] }),
  defineTheme({ id: 'lilac_sunrise', name: 'Lilac Sunrise', bg: ['#F9F5FF', '#F0E8FF', '#FFF0E8'], primary: '#7E5BD0', accent: '#E0805D', cta: ['#8E6BDF', '#DE7554'] }),
  defineTheme({ id: 'blueberry_cream', name: 'Blueberry Cream', bg: ['#F5F6FD', '#E8EBFA', '#FDF1F5'], primary: '#3E4DB8', accent: '#E47898', cta: ['#4F5FC9', '#E26C90'] }),
  defineTheme({ id: 'citrus_garden', name: 'Citrus Garden', bg: ['#FFFAEB', '#FFF0C9', '#F0FAEC'], primary: '#3B934B', accent: '#CE8C27', cta: ['#49A459', '#C38725'] }),
  defineTheme({ id: 'pink_lemonade', name: 'Pink Lemonade', bg: ['#FFF5F7', '#FFE9EF', '#FFFBE6'], primary: '#D6416F', accent: '#B99523', cta: ['#DF5480', '#B58D22'] }),
  defineTheme({ id: 'peacock', name: 'Peacock', bg: ['#F0F8FA', '#DFEFF3', '#F4F0FB'], primary: '#166A7B', accent: '#7B52C9', cta: ['#1D8397', '#8660D3'] }),
  defineTheme({ id: 'indigo_dye', name: 'Indigo Dye', bg: ['#F5F6FB', '#E8EBF6', '#FBF6EA'], primary: '#303F96', accent: '#C78F26', cta: ['#3F4FAA', '#BE8A25'] }),
  defineTheme({ id: 'moroccan_tile', name: 'Moroccan Tile', bg: ['#F2F8FA', '#E2EEF3', '#FFF3EA'], primary: '#1D6F8E', accent: '#DA793E', cta: ['#2A84A6', '#DB7944'] }),
  defineTheme({ id: 'ocean_breeze', name: 'Ocean Breeze', bg: ['#F2F9FD', '#E3F1FA', '#FFF6EA'], primary: '#2081B3', accent: '#D8872F', cta: ['#2E98CC', '#D07F28'] }),
  defineTheme({ id: 'lavender_honey', name: 'Lavender Honey', bg: ['#F8F5FF', '#EEE8FA', '#FFF7E6'], primary: '#7458C4', accent: '#C49026', cta: ['#8569D4', '#BB8B23'] }),
  defineTheme({ id: 'sakura_matcha', name: 'Sakura Matcha', bg: ['#FFF5F8', '#FCE7EF', '#F3F9EA'], primary: '#C4437A', accent: '#6F9A4A', cta: ['#D05A8E', '#779E53'] }),
  defineTheme({ id: 'autumn_maple', name: 'Autumn Maple', bg: ['#FBF5E9', '#F4E6CC', '#F8ECDD'], primary: '#855917', accent: '#B5472C', cta: ['#9D6A1E', '#C25A3A'] }),
  // ---- 20 soft dark presets ----
  defineTheme({ id: 'midnight', name: 'Midnight', dark: true, bg: ['#0F1422', '#151C30', '#1D2742'], primary: '#749FE2', accent: '#929EE7', cta: ['#608CDC', '#7F8CE2'] }),
  defineTheme({ id: 'deep_ocean', name: 'Deep Ocean', dark: true, bg: ['#0C1A26', '#112434', '#183349'], primary: '#3BA6D7', accent: '#30B3B0', cta: ['#2A88BD', '#2BA0AF'] }),
  defineTheme({ id: 'indigo_night', name: 'Indigo Night', dark: true, bg: ['#12122A', '#1A1B3C', '#24265A'], primary: '#958AE7', accent: '#BD8FE7', cta: ['#7266DE', '#9F81E3'] }),
  defineTheme({ id: 'violet_haze', name: 'Violet Haze', dark: true, bg: ['#17112B', '#1F1740', '#2B1F58'], primary: '#A98AE7', accent: '#E17DDC', cta: ['#926DDF', '#C86ADB'] }),
  defineTheme({ id: 'plum_wine', name: 'Plum Wine', dark: true, bg: ['#1D0F20', '#281430', '#381C42'], primary: '#C45AD6', accent: '#E482BC', cta: ['#A946C0', '#D866C8'] }),
  defineTheme({ id: 'noir_rose', name: 'Noir Rose', dark: true, bg: ['#1A1115', '#251A20', '#33232B'], primary: '#E47CA0', accent: '#E584A1', cta: ['#D4668C', '#DF6E96'] }),
  defineTheme({ id: 'wine_velvet', name: 'Wine Velvet', dark: true, bg: ['#1C0F14', '#2A141C', '#3B1B27'], primary: '#DD5770', accent: '#E48894', cta: ['#C94560', '#E07084'] }),
  defineTheme({ id: 'sunset_blvd', name: 'Sunset Blvd', dark: true, bg: ['#1E1218', '#2C1822', '#42212E'], primary: '#DC8954', accent: '#DE6A91', cta: ['#D4713C', '#DC5E8D'] }),
  defineTheme({ id: 'copper_dusk', name: 'Copper Dusk', dark: true, bg: ['#1B120D', '#281A12', '#38251A'], primary: '#D98A56', accent: '#D9934C', cta: ['#C67840', '#D37E35'] }),
  defineTheme({ id: 'espresso', name: 'Espresso', dark: true, bg: ['#17110E', '#221914', '#30241C'], primary: '#B8946C', accent: '#C59A5D', cta: ['#A5805A', '#B78B52'] }),
  defineTheme({ id: 'gold_luxe', name: 'Gold Luxe', dark: true, bg: ['#16130C', '#211C10', '#2F2815'], primary: '#C2972B', accent: '#C99B2B', cta: ['#B58D2D', '#B28E27'] }),
  defineTheme({ id: 'forest_night', name: 'Forest Night', dark: true, bg: ['#0E1710', '#14211A', '#1D3025'], primary: '#51B155', accent: '#89AE29', cta: ['#4DA557', '#67A336'] }),
  defineTheme({ id: 'emerald_night', name: 'Emerald Night', dark: true, bg: ['#0A1A15', '#10261F', '#17372D'], primary: '#2BB286', accent: '#29B68F', cta: ['#24A37C', '#2EA483'] }),
  defineTheme({ id: 'ink_teal', name: 'Ink Teal', dark: true, bg: ['#0B1A1D', '#10262A', '#173A3F'], primary: '#32ADB8', accent: '#2BB0C6', cta: ['#2A9FAB', '#2EA0B0'] }),
  defineTheme({ id: 'borealis', name: 'Borealis', dark: true, bg: ['#0B1A21', '#12253A', '#1E2A4F'], primary: '#2EB097', accent: '#A996E8', cta: ['#2FA48C', '#8E7DE3'] }),
  defineTheme({ id: 'storm_cloud', name: 'Storm Cloud', dark: true, bg: ['#12161C', '#1A212B', '#242E3B'], primary: '#77A1D3', accent: '#84A4CC', cta: ['#6890C4', '#6995CB'] }),
  defineTheme({ id: 'graphite', name: 'Graphite', dark: true, bg: ['#121315', '#1A1C20', '#24272C'], primary: '#8E96A5', accent: '#98A2B5', cta: ['#737C8C', '#8994A6'] }),
  defineTheme({ id: 'mocha_rose', name: 'Mocha Rose', dark: true, bg: ['#1A1315', '#251B1E', '#33262A'], primary: '#C48E8E', accent: '#D29286', cta: ['#B07878', '#C1837B'] }),
  defineTheme({ id: 'synthwave', name: 'Synthwave', dark: true, bg: ['#1A1030', '#241548', '#34195F'], primary: '#DF63C6', accent: '#3BAED5', cta: ['#C94BB5', '#5197D9'] }),
  defineTheme({ id: 'dusk_mauve', name: 'Dusk Mauve', dark: true, bg: ['#18141A', '#221C26', '#30273A'], primary: '#B392C8', accent: '#C890BD', cta: ['#9B78B5', '#B681B6'] }),
]);
/** Ids retired when the presets were redesigned -> closest new preset (so a saved choice never breaks). */
const LEGACY_THEME_ALIASES: Record<string, string> = {
  neon_noir: 'synthwave',
  arctic: 'sky_cotton',
  peach: 'peach_fuzz',
  candy: 'cotton_candy',
  cyberpunk: 'synthwave',
  crimson: 'wine_velvet',
  lilac_dream: 'lilac_sunrise',
  pistachio: 'matcha',
  seashell: 'apricot',
  wisteria: 'lavender_mist',
  obsidian_blue: 'midnight',
  amber_glow: 'copper_dusk',
  mulberry: 'noir_rose',
  steel_navy: 'storm_cloud',
  volcano: 'sunset_blvd',
  galaxy: 'indigo_night',
  midnight_jade: 'emerald_night',
  mocha_milk: 'mocha_mousse',
  pine_abyss: 'ink_teal',
  neon_lime: 'forest_night',
  cobalt_pulse: 'deep_ocean',
  ultraviolet: 'violet_haze',
  lemon_zest: 'lemonade',
  apricot_silk: 'apricot',
  lilac_cloud: 'orchid',
  obsidian_gold: 'gold_luxe',
  abyss_blue: 'deep_ocean',
  northern_lights: 'borealis',
  magma: 'sunset_blvd',
  carbon: 'graphite',
  jade_noir: 'emerald_night',
  amethyst: 'violet_haze',
  blood_moon: 'wine_velvet',
  arctic_night: 'midnight',
  ocean: 'sky_cotton',
  forest: 'honeydew',
  rose: 'sakura',
  lavender: 'lavender_mist',
};
const THEME_LIST = (): Theme[] => Object.values(THEME_REGISTRY);
const THEME_COUNT = THEME_LIST().length;
/** Resolves a theme id (also a retired id from an older build) to a theme; unknown ids fall back to Aurora. */
const resolveTheme = (id?: string | null): Theme =>
  (id ? THEME_REGISTRY[id] ?? THEME_REGISTRY[LEGACY_THEME_ALIASES[id]] : undefined) ?? THEME_REGISTRY[DEFAULT_THEME_ID];

/* ---------- Design tokens: ONE source for spacing, corner radius, elevation and type ---------- */

/** "Your scene" card subtitle on the result screen: hidden until the final wording is decided (flip the flag to show it). */
const SHOW_SCENE_CARD_SUBTITLE = false;
const SCENE_CARD_SUBTITLE = 'Describe the scene you like to render';

const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
const RADIUS = { sm: 8, md: 12, lg: 16, xl: 22, xxl: 28, pill: 999 } as const;
const TYPE = {
  caption: { fontSize: 11, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '700' },
  body: { fontSize: 14, fontWeight: '500' },
  bodyStrong: { fontSize: 14, fontWeight: '700' },
  title: { fontSize: 17, fontWeight: '800' },
  headline: { fontSize: 22, fontWeight: '800' },
  display: { fontSize: 26, fontWeight: '800' },
} as const;
/** Soft shadow ladder: 0 flat, 1 resting card, 2 raised / active, 3 floating (sheets, hero buttons). */
const ELEV = [
  { shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  { shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  { shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  { shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 9 },
] as const;
/**
 * Android's `elevation` draws a shadow layer under the view that shows through translucent backgrounds (soft gradient
 * cards, tinted buttons) as white boxes behind the text. So on Android we keep only the iOS-style shadow props and
 * drop `elevation`; a thin border carries the card edge instead.
 */
const elevation = (level: 0 | 1 | 2 | 3, color = '#000') => ({ shadowColor: color, ...ELEV[level], ...(Platform.OS === 'android' ? { elevation: 0 } : null) });

/** Haptic feedback with one vocabulary: tap (press), select (choice changed), success, warning. Never throws. */
const haptic = {
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  select: () => void Haptics.selectionAsync().catch(() => undefined),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
};

/* ============================================================================
 * 3. UTILITIES
 * ========================================================================== */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const pingPong01 = (x: number) => {
  const m = ((x % 2) + 2) % 2;
  return m <= 1 ? m : 2 - m;
};
const hash2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function hexToRgba(hex: string, a: number): string {
  if (!hex.startsWith('#')) return hex;
  const h = hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
  const n = parseInt(h.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const uid = () => Math.random().toString(36).slice(2, 10);
const deepClone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
function fitSize(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/* ============================================================================
 * 4. SKIA HELPERS + PROCEDURAL DEMO PRODUCT
 * ========================================================================== */

const IMAGE_CACHE = new Map<string, SkImage>();
let memCounter = 0;

/** Registers an SkImage. display=true -> data URI usable by <Image/>; false -> cheap memory handle. */
function registerImage(img: SkImage, display: boolean): string {
  const uri = display
    ? `data:image/png;base64,${img.encodeToBase64(ImageFormat.PNG, 100)}`
    : `mem://skia/${++memCounter}`;
  IMAGE_CACHE.set(uri, img);
  return uri;
}

async function loadSkImage(uri: string): Promise<SkImage> {
  const cached = IMAGE_CACHE.get(uri);
  if (cached) return cached;
  // A data: URI (what the Library stores) is decoded from its base64 text: Skia.Data.fromURI cannot be relied on for it on every platform.
  const m = /^data:[^;,]+;base64,(.*)$/s.exec(uri);
  const data = m ? Skia.Data.fromBase64(m[1]) : await Skia.Data.fromURI(uri);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (!img) throw new Error(`Could not decode image: ${uri.slice(0, 60)}`);
  IMAGE_CACHE.set(uri, img);
  return img;
}

function renderToImage(w: number, h: number, draw: (c: SkCanvas) => void): SkImage {
  const surface = Skia.Surface.MakeOffscreen(w, h);
  if (!surface) throw new Error('Skia offscreen surface unavailable');
  const canvas = surface.getCanvas();
  draw(canvas);
  surface.flush();
  var snapshot = surface.makeImageSnapshot().makeNonTextureImage();
  surface.dispose();
  return snapshot;
}

/**
 * Re-draws any image on a fully TRANSPARENT canvas and returns it as a PNG data URI (alpha kept), optionally capped to maxSide px.
 * Used by the progress overlay: a cut-out that reaches <Image/> as a file / mem handle can show a black box on Android; a PNG data URI
 * produced by Skia from the decoded pixels always carries the real alpha channel.
 */
const TRANSPARENT_PIC_CACHE = new Map<string, string>();
async function toTransparentPngUri(uri: string, maxSide = 512): Promise<string> {
  const hit = TRANSPARENT_PIC_CACHE.get(uri);
  if (hit) return hit;
  const img = await loadSkImage(uri);
  const k = Math.min(1, maxSide / Math.max(img.width(), img.height()));
  const w = Math.max(1, Math.round(img.width() * k));
  const h = Math.max(1, Math.round(img.height() * k));
  const out = renderToImage(w, h, (c) => {
    c.clear(Skia.Color('transparent')); // NOT black: keep the alpha
    c.drawImageRect(img, fullRect(img), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  });
  const data = `data:image/png;base64,${out.encodeToBase64(ImageFormat.PNG, 100)}`;
  TRANSPARENT_PIC_CACHE.set(uri, data);
  return data;
}

/** JPEG has no alpha channel: paints the image on an opaque WHITE background (otherwise the transparent pixels turn black). */
function flattenOnWhite(img: SkImage, w = img.width(), h = img.height()): SkImage {
  return renderToImage(w, h, (c) => {
    c.clear(Skia.Color('#FFFFFF'));
    c.drawImageRect(img, fullRect(img), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  });
}

/**
 * Scene-upload background. 'white' paints the cut-out on a solid white canvas (works for PNG and JPEG); 'transparent'
 * keeps the alpha channel untouched (PNG only - JPEG has no alpha, so it is always flattened on white).
 * Returns the original image when it is already the right size and no white fill is needed.
 */
function applySceneBackground(img: SkImage, w: number, h: number, background: SceneBackground, forceWhite = false): SkImage {
  if (forceWhite || background === 'white') return flattenOnWhite(img, w, h);
  if (w === img.width() && h === img.height()) return img;
  return renderToImage(w, h, (c) => {
    c.clear(Skia.Color('transparent'));
    c.drawImageRect(img, fullRect(img), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  });
}

const fullRect = (img: SkImage) => Skia.XYWHRect(0, 0, img.width(), img.height());
const WHITE_MATRIX = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
const brightnessMatrix = (b: number) => [b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];

/** Procedural sneaker on a 1024x768 viewbox. Lets the app boot with ZERO bundled assets. */
function drawProceduralShoe(c: SkCanvas, w: number, h: number) {
  c.save();
  c.scale(w / 1024, h / 768);
  const fill = (path: ReturnType<ReturnType<typeof Skia.PathBuilder.Make>['build']>, p: ReturnType<typeof Skia.Paint>) => c.drawPath(path, p);
  const P = () => {
    const p = Skia.Paint();
    p.setAntiAlias(true);
    return p;
  };

  // soft ground shadow baked out (transparent PNG should be clean) - none.
  // Sole
  const sole = Skia.PathBuilder.Make()
    .moveTo(96, 556)
    .cubicTo(96, 640, 200, 684, 340, 684)
    .lineTo(810, 684)
    .cubicTo(935, 684, 980, 624, 958, 556)
    .close()
    .build();
  const soleP = P();
  soleP.setShader(
    Skia.Shader.MakeLinearGradient({ x: 0, y: 556 }, { x: 0, y: 684 }, [Skia.Color('#FFFFFF'), Skia.Color('#D5DCE8')], null, TileMode.Clamp),
  );
  fill(sole, soleP);
  // Blue sole stripe
  const stripe = P();
  stripe.setStyle(PaintStyle.Stroke);
  stripe.setStrokeWidth(10);
  stripe.setColor(Skia.Color('#3E86D4'));
  const sp = Skia.PathBuilder.Make()
    .moveTo(130, 640)
    .cubicTo(220, 668, 330, 668, 420, 668)
    .lineTo(800, 668)
    .cubicTo(880, 668, 930, 640, 944, 600)
    .build();
  c.drawPath(sp, stripe);

  // Upper
  const upper = Skia.PathBuilder.Make()
    .moveTo(110, 560)
    .cubicTo(100, 440, 120, 320, 170, 255)
    .cubicTo(200, 225, 250, 225, 290, 260)
    .cubicTo(330, 295, 400, 300, 460, 255)
    .cubicTo(520, 215, 560, 220, 600, 250)
    .cubicTo(700, 330, 860, 390, 930, 470)
    .cubicTo(968, 512, 962, 560, 944, 560)
    .close()
    .build();
  const upperP = P();
  upperP.setShader(
    Skia.Shader.MakeLinearGradient({ x: 0, y: 220 }, { x: 0, y: 560 }, [Skia.Color('#FAFBFD'), Skia.Color('#C9D3E3')], null, TileMode.Clamp),
  );
  fill(upper, upperP);

  // Mesh panel (toe box) dots
  const dot = P();
  dot.setColor(Skia.Color('#B7C4DA'));
  for (let i = 0; i < 26; i++) {
    const x = 640 + (i % 7) * 40 + (Math.floor(i / 7) % 2) * 18;
    const y = 400 + Math.floor(i / 7) * 34 + (i % 7) * 12;
    if (x < 930 && y < 548) c.drawCircle(x, y, 6, dot);
  }

  // Swoosh
  const sw = Skia.PathBuilder.Make()
    .moveTo(320, 470)
    .cubicTo(440, 530, 640, 450, 800, 352)
    .cubicTo(660, 530, 470, 570, 320, 470)
    .close()
    .build();
  const swP = P();
  swP.setShader(
    Skia.Shader.MakeLinearGradient({ x: 320, y: 0 }, { x: 800, y: 0 }, [Skia.Color('#2F74C6'), Skia.Color('#6BB1F0')], null, TileMode.Clamp),
  );
  fill(sw, swP);

  // Heel tab
  const tab = Skia.PathBuilder.Make()
    .moveTo(110, 500)
    .cubicTo(104, 430, 114, 360, 140, 310)
    .lineTo(196, 330)
    .cubicTo(176, 380, 170, 440, 176, 520)
    .close()
    .build();
  const tabP = P();
  tabP.setColor(Skia.Color('#4E92DE'));
  fill(tab, tabP);

  // Collar opening
  const collar = Skia.PathBuilder.Make()
    .moveTo(200, 232)
    .cubicTo(235, 212, 285, 220, 315, 252)
    .cubicTo(280, 262, 230, 258, 200, 232)
    .close()
    .build();
  const colP = P();
  colP.setColor(Skia.Color('#6E7B93'));
  fill(collar, colP);

  // Laces
  const lace = P();
  lace.setStyle(PaintStyle.Stroke);
  lace.setStrokeWidth(9);
  lace.setStrokeCap(1 as any);
  lace.setColor(Skia.Color('#FFFFFF'));
  const laceShadow = P();
  laceShadow.setStyle(PaintStyle.Stroke);
  laceShadow.setStrokeWidth(12);
  laceShadow.setColor(Skia.Color('#B8C3D6'));
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = 405 + t * 170;
    const y = 292 + t * 12 - Math.sin(t * Math.PI) * 4 - i * 6;
    const l = Skia.PathBuilder.Make()
      .moveTo(x - 38, y + 20)
      .lineTo(x + 34, y - 26)
      .build();
    c.drawPath(l, laceShadow);
    c.drawPath(l, lace);
  }
  c.restore();
}

/* ============================================================================
 * 5. MOCK AI SERVICES  /  REAL STUBS  /  FACADE  /  PIPELINE
 * ========================================================================== */

// ---- 5.1 mock functions -----------------------------------------------------

async function mockRemoveBackground(imageUri: string): Promise<[SkImage, string]> {
  await sleep(700);
  let out: SkImage;
  if (!imageUri || imageUri === DEMO_PRODUCT_URI) {
    out = renderToImage(MAX_TEX, 576, (c) => drawProceduralShoe(c, MAX_TEX, 576));
  } else {
    const src = await loadSkImage(imageUri);
    const { w, h } = fitSize(src.width(), src.height(), MAX_TEX);
    out = renderToImage(w, h, (c) => {
      c.drawImageRect(src, fullRect(src), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
      // MOCK matting: soft elliptical alpha mask (a real segmentation mask replaces this).
      const mask = Skia.Paint();
      mask.setBlendMode(BlendMode.DstIn);
      c.save();
      c.scale(1, h / w);
      mask.setShader(
        Skia.Shader.MakeRadialGradient(
          { x: w / 2, y: w / 2 },
          w * 0.62,
          [Skia.Color('#FFFFFF'), Skia.Color('#FFFFFF'), Skia.Color('#FFFFFF00')],
          [0, 0.7, 1],
          TileMode.Clamp,
        ),
      );
      c.drawRect(Skia.XYWHRect(0, 0, w, w), mask);
      c.restore();
    });
  }
  return [out, registerImage(out, true)];
}

/**
 * Mock API result: the sample page returned by the cloud API, used when GLOBAL_MODE = MOCK.
 * It lives in assets/html/demo.html (edit the file, not this code). Read once, then cached.
 * Metro must treat .html as an asset: in metro.config.js add  config.resolver.assetExts.push('html');
 */
const DEMO_HTML_MODULE = require('../../assets/html/demo.html');
let demoHtmlCache: string | null = null;
async function loadDemoHtml(): Promise<string> {
  if (demoHtmlCache) return demoHtmlCache;
  const asset = Asset.fromModule(DEMO_HTML_MODULE);
  if (!asset.localUri) await asset.downloadAsync(); // dev server / release bundle: copies the file next to the app
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error('assets/html/demo.html could not be resolved');
  const text = await new File(uri).text();
  if (!text.trim()) throw new Error('assets/html/demo.html is empty');
  demoHtmlCache = text;
  return text;
}

/**
 * The 5 bundled MOCK images: ../../assets/images/shoe-{front,left,right,back,scene}.png.
 * Metro needs every file to exist, so set USE_BUNDLED_MOCK_IMAGES = false AND delete this map if you do not have them yet.
 */
const BUNDLED_MOCK_IMAGES: Record<CloudAngle, number> = {
  front: require('../../assets/images/shoe-front.png'),
  left: require('../../assets/images/shoe-left.png'),
  right: require('../../assets/images/shoe-right.png'),
  back: require('../../assets/images/shoe-back.png'),
  scene: require('../../assets/images/shoe-scene.png'),
};
/**
 * Generic, product-neutral images (e.g. a golden box) for the progress tiles in PRODUCTION: shown for an angle / scene image that the cloud has not delivered yet,
 * instead of the user's own cut-out. MOCK mode keeps showing the demo shoe views there.
 */
const BUNDLED_PROGRESS_IMAGES: Record<CloudAngle, number> = {
  front: require('../../assets/images/progress-front.png'),
  left: require('../../assets/images/progress-left.png'),
  right: require('../../assets/images/progress-right.png'),
  back: require('../../assets/images/progress-back.png'),
  scene: require('../../assets/images/progress-scene.png'),
};
const useGenericProgressImages = () => GLOBAL_MODE !== ('MOCK' as GlobalMode);
/** Makes the bundled progress images ready (local files). Safe to call many times. */
const preloadProgressImages = (): Promise<unknown> => Asset.loadAsync(Object.values(BUNDLED_PROGRESS_IMAGES)).catch((e) => console.warn('[Magic3DStudio] progress images not loaded', e));
/** URI of the generic progress image of an angle, or undefined when it is not used (MOCK) or not available. */
function progressImageUri(angle: CloudAngle): string | undefined {
  if (!useGenericProgressImages()) return undefined;
  try {
    const a = Asset.fromModule(BUNDLED_PROGRESS_IMAGES[angle]);
    return a.localUri ?? a.uri;
  } catch {
    return undefined;
  }
}
const bundledUriCache = new Map<CloudAngle, string>();
/** Resolves a bundled asset to a local file/http URI that Image, Skia and three.js can load (works in Expo Go and release builds). */
async function bundledMockUri(angle: CloudAngle): Promise<string> {
  const hit = bundledUriCache.get(angle);
  if (hit) return hit;
  const asset = Asset.fromModule(BUNDLED_MOCK_IMAGES[angle]);
  if (!asset.localUri) await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  // Validate the file decodes, and register the pixels: the 3D textures are built from this cache (not from the URI).
  const img = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!img) throw new Error(`Bundled mock image "${angle}" is missing or not a valid image (check BUNDLED_MOCK_IMAGES.${angle})`);
  IMAGE_CACHE.set(uri, img);
  bundledUriCache.set(angle, uri);
  return uri;
}

/**
 * Product views. In PRODUCTION the real four angle images arrive from the cloud job (watchAngleImages);
 * the bundled demo images below are used in MOCK mode only.
 */
/** PRODUCTION: until the cloud angle images arrive, every view is the real foreground (cut-out) of the user's photo. */
function foregroundProductViews(cleanUri: string): ProductViews {
  return { front: { label: 'front', imageUri: cleanUri }, left: { label: 'left', imageUri: cleanUri }, right: { label: 'right', imageUri: cleanUri }, back: { label: 'back', imageUri: cleanUri } };
}
async function loadDemoProductViews(): Promise<ProductViews> {
  await sleep(300);
  const [front, left, right, back] = await Promise.all((['front', 'left', 'right', 'back'] as const).map(bundledMockUri));
  return { front: { label: 'front', imageUri: front }, left: { label: 'left', imageUri: left }, right: { label: 'right', imageUri: right }, back: { label: 'back', imageUri: back } };
}

/**
 * Depth maps are rendering assets. To use bundled depth PNGs instead of the procedural mock,
 * uncomment and point at your /assets folder:
 *   const BUNDLED_DEPTH: Partial<Record<ViewLabel, number>> = {
 *     front: require('./assets/depth/front.png'), ...
 *   };
 * and resolve them to URIs with expo-asset (Asset.fromModule(x).uri).
 */
async function mockGenerateDepthMaps(views: ProductViews): Promise<DepthMaps> {
  await sleep(800);
  const out = {} as DepthMaps;
  for (const label of VIEW_ORDER) {
    const src = await loadSkImage(views[label].imageUri);
    const { w, h } = fitSize(src.width(), src.height(), MAX_DEPTH_TEX);
    const depth = renderToImage(w, h, (c) => {
      c.clear(Skia.Color('#000000'));
      const p = Skia.Paint();
      p.setColorFilter(Skia.ColorFilter.MakeMatrix(WHITE_MATRIX));
      const sigma = Math.max(w, h) * 0.045;
      p.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal, null));
      c.drawImageRect(src, fullRect(src), Skia.XYWHRect(0, 0, w, h), p);
    });
    out[label] = registerImage(depth, false);
  }
  return out;
}

/** Product analysis and the scene spec are done by the backend. Locally we only measure what the 3D preview needs (aspect ratio, colours). */
async function readProductMetadata(images: ProductViews): Promise<ProductMetadata> {
  const src = await loadSkImage(images.left.imageUri);
  const G = 12;
  const small = renderToImage(G, G, (c) => c.drawImageRect(src, fullRect(src), Skia.XYWHRect(0, 0, G, G), Skia.Paint()));
  const px = small.readPixels(0, 0, { width: G, height: G, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }) as Uint8Array | null;
  const samples: { lum: number; hex: string }[] = [];
  if (px) {
    for (let i = 0; i < G * G; i++) {
      const [r, g, b, a] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]];
      if (a < 128) continue;
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      samples.push({ lum: 0.299 * r + 0.587 * g + 0.114 * b, hex });
    }
    samples.sort((x, y) => x.lum - y.lum);
  }
  const pick = (q: number) => samples[Math.floor(clamp(q, 0, 0.999) * samples.length)]?.hex ?? '#CCCCCC';
  return {
    category: 'generic',
    name: 'Product',
    dominantColors: [pick(0.2), pick(0.5), pick(0.85)],
    aspectRatio: src.width() / src.height(),
    suggestedScale: 1,
    materials: [],
    description: '',
  };
}

// ---- 5.2 real implementations (stubs returning mock for now) -----------------

async function realRemoveBackground(imageUri: string): Promise<[SkImage, string]> {
  // The built-in demo shoe has no photo to cut out.
  if (!imageUri || imageUri === DEMO_PRODUCT_URI) return mockRemoveBackground(imageUri);
  const isDownScaleInput = false;
  const isDownScaleOutput = false;
  const isScaleOutputToOriginal = true;
  const isSavedToFile = true;
  const [removedBackgroundSkImage, removedBackgroundImageUri] = await removeBackground_Native_v2(
    imageUri,
    isDownScaleInput,
    isDownScaleOutput,
    isScaleOutputToOriginal,
    'triangulation',
    isSavedToFile,
  );
  if (!removedBackgroundSkImage) throw new Error('Background removal returned no image');
  // The 3D textures are built from IMAGE_CACHE, so the cut-out must be registered under the URI the rest of the app uses.
  const uri = removedBackgroundImageUri || registerImage(removedBackgroundSkImage, false);
  IMAGE_CACHE.set(uri, removedBackgroundSkImage);
  return [removedBackgroundSkImage, uri];
}
async function realGenerateDepthMaps(views: ProductViews): Promise<DepthMaps> {
  // TODO(production): depth estimation (Depth Anything / MiDaS) per view -> grayscale PNG URIs.
  return mockGenerateDepthMaps(views);
}
// ---- 5.3 facade --------------------------------------------------------------

const isMockMode = () => GLOBAL_MODE === 'MOCK';
/** The bundled sample 3D page. MOCK mode only: PRODUCTION must show the page the backend generated, or the "try again" card. */
const mockSceneHtml = async (): Promise<string> => {
  if (!isMockMode()) throw new Error('The sample scene is only available in MOCK mode');
  return loadDemoHtml();
};
/** true when the credit backend should be the real one (PRODUCTION, or MOCK with the test switch). */
const shouldUseRealCredit = () => !isMockMode() || ENABLE_TEST_REAL_CREDIT;
/** true when photo + prompt are really uploaded and the cloud is really polled. */
const shouldUseRealUpload = () => !isMockMode() || ENABLE_TEST_REAL_UPLOAD;
const Services = {
  removeBackground: async (u: string): Promise<[SkImage, string]> => {
    if (!useRealForeground()) return mockRemoveBackground(u);
    try {
      return await realRemoveBackground(u);
    } catch (e) {
      if (!isMockMode()) throw e;
      console.warn('[Magic3DStudio] real background removal failed in MOCK mode (Expo Go has no native module?), using the demo cut-out', e);
      return mockRemoveBackground(u);
    }
  },
  /** MOCK: bundled demo images. PRODUCTION: the real foreground (the real angle images come from the cloud job). */
  generateViews: (cleanUri: string) => (!useRealForeground() ? loadDemoProductViews() : Promise.resolve(foregroundProductViews(cleanUri))),
  generateDepth: (v: ProductViews) => (isMockMode() ? mockGenerateDepthMaps(v) : realGenerateDepthMaps(v)),
  /** Film Studio main flow: product + description -> full Three.js HTML page. */
  sceneHtml: async (a: ProductAsset, p: string, names: SceneNames, onStage?: (label: string) => void, onJob?: (job: SceneJob) => void | Promise<void>): Promise<string> => {
    // MOCK: no storage, no cloud - hand back the bundled sample page straight away (works in Expo Go).
    if (!shouldUseRealUpload()) {
      const mockJob: SceneJob = { jobId: ENABLE_TEST_REAL_DOWNLOAD ? uid() : 'mock', names, ok: true, startedAt: Date.now() };
      onJob?.(mockJob);
      if (!ENABLE_TEST_REAL_DOWNLOAD) return await mockSceneHtml();
      onStage?.('Waiting for the cloud scene');
      return get3DScene(mockJob); // test: really check storage + download (nothing was uploaded, so expect the timeout)
    }
    onStage?.('Uploading photo & prompt');
    // PRODUCTION uploads the FOREGROUND (background removed), not the original photo.
    const job = await uploadProductPhoto(a.cleanImageUri, p, names);
    if (!job.ok) throw new Error(job.error ?? 'Upload failed');
    onJob?.(job);
    onStage?.('Waiting for the cloud scene');
    return get3DScene(job);
  },
  /** Camera Studio: blended photo + product mask -> harmonized photo. */
  harmonize: (blendedUri: string, maskUri: string, category?: string) => harmonizeImage(blendedUri, maskUri, category),
};

/** Depth maps are not implemented yet: the step is skipped and hidden. Flip to true when `realGenerateDepthMaps` exists. */
const ENABLE_DEPTH_MAPS = false;
const ALL_PIPELINE_STEPS: { id: string; label: string; icon: IconName; etaS: number; enabled: boolean }[] = [
  { id: 'remove_bg', label: 'Removing background', icon: 'cut-outline', etaS: 2, enabled: true },
  { id: 'views', label: 'Generating high quality photos from your image', icon: 'cube-outline', etaS: 3, enabled: true },
  { id: 'depth', label: 'Estimating depth maps', icon: 'layers-outline', etaS: 3, enabled: ENABLE_DEPTH_MAPS },
  { id: 'plan', label: 'Building your 3D scene', icon: 'film-outline', etaS: 20, enabled: true },
];
/** The steps the user actually sees (disabled ones are left out; indices below follow this list). */
const PIPELINE_STEPS = ALL_PIPELINE_STEPS.filter((st) => st.enabled);
/** How many of them belong to the photo preparation (everything before the cloud scene). */
const PREP_STEP_COUNT = PIPELINE_STEPS.length - 1;

/* ---- 5.3a Cloud scene job: upload (photo + prompt) -> poll -> HTML. Used in BOTH MOCK and PRODUCTION mode. ---- */

/** Extra product angles the cloud can generate. Order = the canonical order used in file names. */
type CloudAngle = 'front' | 'left' | 'right' | 'back' | 'scene';
const CLOUD_ANGLES: { id: CloudAngle; label: string; icon: IconName }[] = [
  { id: 'front', label: 'Front', icon: 'arrow-up-circle-outline' },
  { id: 'left', label: 'Left', icon: 'arrow-back-circle-outline' },
  { id: 'right', label: 'Right', icon: 'arrow-forward-circle-outline' },
  { id: 'back', label: 'Back', icon: 'arrow-down-circle-outline' },
  { id: 'scene', label: 'Scene', icon: 'image-outline' },
];
/** Angles that are ALWAYS requested from the cloud and have no switch in Settings. */
const ALWAYS_ON_ANGLES: CloudAngle[] = ['scene'];

//PRODUCTION-CHECK: add more or remove from this list for pre-check the product view images
const ALWAYS_ON_ANGLES_CHECKED: CloudAngle[] = ['scene'];// ['scene','left'];
/** The angles the user can tick in Settings (everything except the always-on ones). */
const SETTINGS_ANGLES = CLOUD_ANGLES.filter((a) => !ALWAYS_ON_ANGLES.includes(a.id));
/** Canonical order, always-on angles forced in. Used for the default, for saving and for loading. */
// const withAlwaysOnAngles = (v: readonly string[]): CloudAngle[] => CLOUD_ANGLES.map((a) => a.id).filter((id) => ALWAYS_ON_ANGLES.includes(id) || v.includes(id));
const withAlwaysOnAngles = (v: readonly string[]): CloudAngle[] => CLOUD_ANGLES.map((a) => a.id).filter((id) => ALWAYS_ON_ANGLES_CHECKED.includes(id) || v.includes(id));

/**
 * Scene quality (Settings). It is written into the upload file name right before the device id, and the cloud picks the pipeline from it:
 *   'standard'  the scene agent runs once                                         = 1 credit (as before)
 *   'advanced'  two stages: structure first, then a second pass that adds detail = 2 credits
 */
type SceneQuality = 'standard' | 'advanced';
const SCENE_QUALITIES: { id: SceneQuality; label: string; credits: number; caption: string; icon: IconName }[] = [
  { id: 'standard', label: 'Standard', credits: 1, caption: 'Fast, one design pass', icon: 'flash-outline' },
  { id: 'advanced', label: 'Advanced', credits: 2, caption: 'Richer, more detailed scene. Takes longer', icon: 'sparkles-outline' },
];
const DEFAULT_SCENE_QUALITY: SceneQuality = 'standard';
const sceneQualityCost = (q: SceneQuality): number => SCENE_QUALITIES.find((x) => x.id === q)?.credits ?? 1;
const asSceneQuality = (v: unknown): SceneQuality => (v === 'advanced' ? 'advanced' : DEFAULT_SCENE_QUALITY);

/**
 * File-name convention shared with the cloud pipeline; the device id (16 chars, kept in expo-sqlite) always ends the name.
 * With base "shoe-6868", angles left, back, scene and device "afdc6789x23vzx21":
 *   upload:   shoe-6868-left-back-scene-afdc6789x23vzx21.png  (+ .txt for the prompt)
 *   returns:  shoe-6868-left-afdc6789x23vzx21.png, ...-back-..., ...-scene-...  (any order, the cloud runs async)
 *             shoe-6868-left-back-scene-afdc6789x23vzx21.html (the 3D scene page)
 * With no angle selected the key is just the base name.
 */
type SceneNames = { base: string; key: string; angles: CloudAngle[]; imageFile: string; promptFile: string; htmlFile: string; /** the scene spec the cloud writes next to the page (same name, .json) */ specFile: string; angleFile: (a: CloudAngle) => string };
/**
 * File naming (cloud contract). With <base> = magic3dstudio-<timestamp> and <angles> = the selected angles joined by '-':
 *   upload   <base>-<angles>-view-<quality>-<deviceId>.png / .txt   ("-view" marks the INPUT photo + prompt; <quality> = standard | advanced,
 *                                                              the cloud runs the one-pass or the two-stage scene agent from it)
 *   result   <base>-<angles>-view-<quality>-<deviceId>.html          (the upload name with .png -> .html)
 *   images   <base>-<angle>-<deviceId>.png                    (one per angle; with a single angle this equals the upload name
 *                                                              minus "-view", so the upload is never overwritten)
 */
function buildSceneNames(selected: CloudAngle[], deviceId: string, quality: SceneQuality = DEFAULT_SCENE_QUALITY): SceneNames {
  const base = `magic3dstudio-${Date.now()}`;
  const angles = CLOUD_ANGLES.map((a) => a.id).filter((id) => selected.includes(id));
  const key = [base, ...angles].join('-');
  return {
    base,
    key,
    angles,
    imageFile: `${key}-view-${quality}-${deviceId}.png`,
    promptFile: `${key}-view-${quality}-${deviceId}.txt`,
    htmlFile: `${key}-view-${quality}-${deviceId}.html`,
    specFile: `${key}-view-${quality}-${deviceId}.json`,
    angleFile: (a) => `${base}-${a}-${deviceId}.png`,
  };
}

/** Longest side (px) of any image sent to the cloud: a larger one is scaled down first (faster upload, less to process). */
const MAX_IMAGE_UPLOAD_SIZE = 1024;
/** JPEG quality (percent) of the foreground photo sent to the cloud. */
const SCENE_UPLOAD_JPEG_QUALITY = 82;

/** Everything the cloud needs to find the job's inputs, and what get3DScene polls on. */
type SceneJob = {
  jobId: string;
  names?: SceneNames;
  /** Storage path of the uploaded product photo (undefined when the upload failed). */
  imagePath?: string;
  /** Storage path of the uploaded scene-description text file (undefined when the upload failed). */
  promptPath?: string;
  /** false when any upload failed; `error` says why. Never throws. */
  ok: boolean;
  error?: string;
  startedAt: number;
};

/**
 * Step 1 of the cloud scene API: uploads the product photo and the 3D scene prompt to storage
 * (public/scenes/<jobId>/product.png + prompt.txt). The cloud pipeline starts from those two files.
 * Never throws: the caller decides (MOCK mode carries on without storage, PRODUCTION treats it as an error).
 * TODO(production): switch to the protected/<identityId>/ path once auth is in place, and kick off the generation
 * (e.g. an Amplify mutation / API call that carries `jobId`) if storage events do not trigger it by themselves.
 */
/**
 * UPLOAD ORDER RULE: the .txt file triggers the Lambda, so it must be the LAST file of a job. Every flow awaits the full
 * upload (`.result`) of the images / html / json first, calls this to double-check they are readable in storage, and only then uploads the .txt.
 * Best effort: it never throws (a missing getProperties or a transient error must not fail the job), it only waits a little when the file is not visible yet.
 */
async function confirmUploaded(paths: string[]): Promise<void> {
  for (const path of paths) {
    for (let i = 0; i < 6; i++) {
      try {
        await getProperties({ path });
        break;
      } catch (e) {
        if (i === 5) console.warn('[Magic3DStudio] could not confirm the upload of', path, '- continuing', e);
        else await sleep(400);
      }
    }
  }
}

async function uploadProductPhoto(imageUri: string, prompt: string, names?: SceneNames): Promise<SceneJob> {
  const jobId = uid();
  const job: SceneJob = { jobId, names, ok: false, startedAt: Date.now() };
  const imageName = names?.imageFile ?? 'product.png';
  const promptName = names?.promptFile ?? 'prompt.txt';
  try {
    // Everything below is bounded: a hang anywhere (decoding, reading, network) ends as a clear "upload timed out" error.
    await withTimeout(
      (async () => {
        // Format, quality and background come from the backend (MagicStudioSettings: imageformatforscene / imagequalityforscene /
        // backgroundforscene); PNG / 100 / transparent when missing or unreadable.
        // 'transparent' keeps the PNG cut-out as it is. 'white' (or JPEG, which has no alpha) flattens the cut-out on white first.
        const { imageformatforscene, imagequalityforscene, backgroundforscene } = await readSceneUploadSettings();
        const isJpeg = imageformatforscene === 'JPEG';
        const contenttype = isJpeg ? 'image/jpeg' : 'image/png';

        //PRODUCTION-NOTE: set isUploadFullSize = false to cap the longest side at MAX_IMAGE_UPLOAD_SIZE (smaller, faster upload)
        const isUploadFullSize = true;

        const direct = dataUriBytes(imageUri);
        const skiaImage = direct ? Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(direct)) : await loadSkImage(imageUri);
        if (!skiaImage) throw new Error('Could not decode the image to upload');

        const fit = isUploadFullSize ? { w: skiaImage.width(), h: skiaImage.height() } : fitSize(skiaImage.width(), skiaImage.height(), MAX_IMAGE_UPLOAD_SIZE);
        const src: SkImage = applySceneBackground(skiaImage, fit.w, fit.h, backgroundforscene, isJpeg); // JPEG is always white

        // Encode the image into a Uint8Array (quality only matters for JPEG; PNG is lossless)
        const uint8Array: Uint8Array = src.encodeToBytes(isJpeg ? ImageFormat.JPEG : ImageFormat.PNG, imagequalityforscene);

        // Extract an ArrayBuffer (sliced by offset/length to ensure clean buffer boundaries)
        const fileData = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength) as ArrayBuffer;
        console.log(`[Magic3DStudio] scene upload: ${skiaImage.width()}x${skiaImage.height()} -> ${fit.w}x${fit.h} ${imageformatforscene} q${imagequalityforscene} bg=${isJpeg ? 'white (jpeg)' : backgroundforscene} ${(fileData.byteLength / 1048576).toFixed(2)} MB`);

        const image = await uploadData({
          path: `public/scenes/${jobId}/${imageName}`,
          data: fileData,
          options: { contentType: contenttype },
        }).result;
        job.imagePath = image.path;
        console.log('[Magic3DStudio] uploaded product photo:', image.path);
        await confirmUploaded([image.path]); // the image is in storage before the prompt (.txt) that triggers the Lambda

        const text = await uploadData({
          path: `public/scenes/${jobId}/${promptName}`,
          data: prompt,
          options: { contentType: 'text/plain' },
        }).result;
        job.promptPath = text.path;
        console.log('[Magic3DStudio] uploaded scene prompt:', text.path);
      })(),
      UPLOAD_TIMEOUT_MS,
    );

    job.ok = true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    job.error = msg === 'timeout' ? `Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s` : msg;
    console.warn('[Magic3DStudio] uploadProductPhoto failed:', job.error);
  }
  return job;
}

/** Skia-decodes any image uri (file, http or data:), flattens it on white, caps it at MAX_IMAGE_UPLOAD_SIZE and encodes JPEG (SCENE_UPLOAD_JPEG_QUALITY). */
async function encodeUploadJpeg(uri: string): Promise<{ data: ArrayBuffer; w: number; h: number; srcW: number; srcH: number; ms: number }> {
  const t0 = Date.now();
  const direct = dataUriBytes(uri);
  const img = direct ? Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(direct)) : await loadSkImage(uri);
  if (!img) throw new Error('Could not decode the image to upload');
  const fit = fitSize(img.width(), img.height(), MAX_IMAGE_UPLOAD_SIZE);
  const flat = renderToImage(fit.w, fit.h, (c) => {
    c.clear(Skia.Color('#FFFFFF'));
    c.drawImageRect(img, fullRect(img), Skia.XYWHRect(0, 0, fit.w, fit.h), Skia.Paint());
  });
  const jpeg = flat.encodeToBytes(ImageFormat.JPEG, SCENE_UPLOAD_JPEG_QUALITY);
  return { data: jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer, w: fit.w, h: fit.h, srcW: img.width(), srcH: img.height(), ms: Date.now() - t0 };
}

/* ---- Scene spec (.json) + persisted files + Retouch ------------------------------------------------------------ */

/** MOCK mode only: show the Retouch icon in the Library and simulate the round trip. PRODUCTION reads 'showretouch' from the backend (default: hidden). */
const MOCK_SHOW_RETOUCH = false;

const parseBoolish = (raw: unknown): boolean => {
  if (typeof raw === 'boolean') return raw;
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
};
/** Length of a 3D-canvas video (react-native-view-recorder has no stop, the duration is given at the start). Backend 'recorder3dcanvasduration', seconds. */
const DEFAULT_RECORDER_3D_DURATION_S = 20;
const parseRecorderDuration = (raw: unknown): number => {
  const n = Number(raw);
  return raw === null || raw === undefined || raw === '' || !Number.isFinite(n) || n <= 0 ? DEFAULT_RECORDER_3D_DURATION_S : Math.min(300, Math.max(1, Math.round(n)));
};
/** MOCK mode only: record the 3D canvas with react-native-view-recorder (needs a development build). PRODUCTION reads 'isusingrecorder3dcanvas' (default false). */
const MOCK_USING_RECORDER_3D_CANVAS = false;
/** Library used to snapshot the 3D preview canvas for a Retouch (backend 'canvassnapshotlib'; default / fallback: react-native-view-recorder). */
type SnapshotLib = 'react-native-view-recorder' | 'react-native-view-shot';
const DEFAULT_3D_CANVAS_SNAPSHOT_LIB: SnapshotLib = 'react-native-view-recorder';
/** MOCK mode only (the snapshot itself is skipped in MOCK mode). PRODUCTION reads the backend 'canvassnapshotlib'. */
const MOCK_3D_CANVAS_SNAPSHOT_LIB: SnapshotLib = DEFAULT_3D_CANVAS_SNAPSHOT_LIB;
/**
 * Milliseconds to wait, once the 3D preview reports 'ready', before the snapshot is taken (BOTH libraries): the WebGL canvas needs a few
 * seconds of the scene on screen, otherwise the snapshot comes out black.
 */
const SNAPSHOT_RENDER_DELAY_MS = 4000;
const parseSnapshotLib = (raw: unknown): SnapshotLib => {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  return v === 'react-native-view-shot' || v === 'view-shot' || v === 'viewshot' ? 'react-native-view-shot' : DEFAULT_3D_CANVAS_SNAPSHOT_LIB;
};
type BackendFlags = { showretouch: boolean; showrevenuecat: boolean; islogdetail: boolean; istakesnapshotforretouch: boolean; isusingrecorder3dcanvas: boolean; recorder3dcanvasduration: number; snapshotlib: SnapshotLib };
let backendFlagsCache: BackendFlags | null = null;
/**
 * Reads the feature flags of the global MagicStudioSettings row ('showretouch', 'showrevenuecat'; the backend may store them as
 * strings). Missing, invalid or any failure = false, so a feature stays hidden until the backend turns it on. Only a good read is cached.
 */
async function readBackendFlags(): Promise<BackendFlags | null> {
  if (backendFlagsCache) return backendFlagsCache;
  try {
    const data = await gql<any>(listMagicStudioSettings, { limit: 1 });
    const row = data?.listMagicStudioSettings?.items?.find((x: any) => x) ?? null;
    const snapLibRaw = row?.canvassnapshotlib;
    backendFlagsCache = { showretouch: parseBoolish(row?.showretouch), showrevenuecat: parseBoolish(row?.showrevenuecat), islogdetail: parseBoolish(row?.islogdetail), istakesnapshotforretouch: parseBoolish(row?.istakesnapshotforretouch), isusingrecorder3dcanvas: parseBoolish(row?.isusingrecorder3dcanvas), recorder3dcanvasduration: parseRecorderDuration(row?.recorder3dcanvasduration), snapshotlib: parseSnapshotLib(snapLibRaw) };
    console.log(`[Magic3DStudio] backend flags: showretouch=${String(row?.showretouch)} -> ${backendFlagsCache.showretouch}, showrevenuecat=${String(row?.showrevenuecat)} -> ${backendFlagsCache.showrevenuecat}, islogdetail=${String(row?.islogdetail)} -> ${backendFlagsCache.islogdetail}, istakesnapshotforretouch=${String(row?.istakesnapshotforretouch)} -> ${backendFlagsCache.istakesnapshotforretouch}, isusingrecorder3dcanvas=${String(row?.isusingrecorder3dcanvas)} -> ${backendFlagsCache.isusingrecorder3dcanvas}, recorder3dcanvasduration=${String(row?.recorder3dcanvasduration)} -> ${backendFlagsCache.recorder3dcanvasduration}s, canvassnapshotlib=${String(snapLibRaw)} -> ${backendFlagsCache.snapshotlib}`);
    return backendFlagsCache;
  } catch (e) {
    console.warn('[Magic3DStudio] could not read the backend flags for now - those features stay hidden', e);
    return null;
  }
}
/**
 * Scene upload encoding, read from the global MagicStudioSettings row:
 *   imageformatforscene  'PNG' | 'JPEG'  (default 'PNG' when missing / null / unreadable)
 *   imagequalityforscene 1..100          (default 100 when missing / null / unreadable)
 *   backgroundforscene   'white' | 'transparent'  (default 'transparent' when missing / null / unreadable; JPEG is always white)
 *   backgroundforangleimage 'white' | 'transparent'  (cut-out angle images after download; default 'transparent' when missing / null / unreadable)
 * Module-level state variables (uploadProductPhoto is not a component); updated on every successful read.
 */
type SceneImageFormat = 'PNG' | 'JPEG';
type SceneBackground = 'white' | 'transparent';
let imageformatforscene: SceneImageFormat = 'PNG';
let imagequalityforscene = 100;
let backgroundforscene: SceneBackground = 'transparent'; // backend 'backgroundforscene': 'white' | 'transparent' (default / fallback: transparent)
let backgroundforangleimage: SceneBackground = 'transparent'; // backend 'backgroundforangleimage': the same for the downloaded front/left/right/back images
let sceneUploadSettingsRead = false;
const parseSceneFormat = (raw: unknown): SceneImageFormat => {
  const v = String(raw ?? '').trim().toUpperCase();
  return v === 'JPEG' || v === 'JPG' ? 'JPEG' : 'PNG';
};
const parseSceneBackground = (raw: unknown): SceneBackground => (String(raw ?? '').trim().toLowerCase() === 'white' ? 'white' : 'transparent');
const parseSceneQuality = (raw: unknown): number => {
  const n = Number(raw);
  return raw === null || raw === undefined || raw === '' || !Number.isFinite(n) ? 100 : Math.min(100, Math.max(1, Math.round(n)));
};
async function readSceneUploadSettings(): Promise<{ imageformatforscene: SceneImageFormat; imagequalityforscene: number; backgroundforscene: SceneBackground; backgroundforangleimage: SceneBackground }> {
  if (!sceneUploadSettingsRead) {
    try {
      const data = await gql<any>(listMagicStudioSettings, { limit: 1 });
      const row = data?.listMagicStudioSettings?.items?.find((x: any) => x) ?? null;
      imageformatforscene = parseSceneFormat(row?.imageformatforscene);
      imagequalityforscene = parseSceneQuality(row?.imagequalityforscene);
      backgroundforscene = parseSceneBackground(row?.backgroundforscene);
      backgroundforangleimage = parseSceneBackground(row?.backgroundforangleimage);
      sceneUploadSettingsRead = true; // only a good read is cached
      console.log(`[Magic3DStudio] scene upload settings: format=${imageformatforscene}, quality=${imagequalityforscene}, background=${backgroundforscene}, angleBackground=${backgroundforangleimage}`);
    } catch (e) {
      imageformatforscene = 'PNG';
      imagequalityforscene = 100;
      backgroundforscene = 'transparent';
      backgroundforangleimage = 'transparent';
      console.warn('[Magic3DStudio] could not read the scene upload settings - using PNG / 100 / transparent', e);
    }
  }
  return { imageformatforscene, imagequalityforscene, backgroundforscene, backgroundforangleimage };
}
async function readShowRetouch(): Promise<boolean> {
  // MOCK mode too: the backend 'showretouch' flag turns the Retouch button on (MOCK_SHOW_RETOUCH forces it on); a failed read leaves it off.
  if (isMockMode() && MOCK_SHOW_RETOUCH) return true;
  return (await readBackendFlags())?.showretouch ?? false;
}
/**
 * true = a Retouch first snapshots the 3D preview canvas (react-native-view-recorder) and uploads it with the other inputs;
 * backend 'istakesnapshotforretouch' (default / fallback: false, also on a missing field or any failure).
 */
async function readIsTakeSnapshotForRetouch(): Promise<boolean> {
  if (isMockMode() && !(ENABLE_TEST_REAL_UPLOAD && ENABLE_TEST_REAL_DOWNLOAD)) return false;
  return (await readBackendFlags())?.istakesnapshotforretouch ?? false;
}
/**
 * true = the Record button films the 3D canvas with react-native-view-recorder (fixed duration, no stop);
 * false (default, missing field or any failure) = the current expo-turbo-screen-recorder flow.
 */
async function readIsUsingRecorder3dCanvas(): Promise<boolean> {
  if (isMockMode() && !(ENABLE_TEST_REAL_UPLOAD && ENABLE_TEST_REAL_DOWNLOAD)) return MOCK_USING_RECORDER_3D_CANVAS;
  return (await readBackendFlags())?.isusingrecorder3dcanvas ?? false;
}
/** Library that snapshots the 3D canvas for a Retouch: backend 'canvassnapshotlib' ('react-native-view-recorder' (default) | 'react-native-view-shot'). */
async function read3dCanvasSnapshotLib(): Promise<SnapshotLib> {
  if (isMockMode() && !(ENABLE_TEST_REAL_UPLOAD && ENABLE_TEST_REAL_DOWNLOAD)) return MOCK_3D_CANVAS_SNAPSHOT_LIB;
  return (await readBackendFlags())?.snapshotlib ?? DEFAULT_3D_CANVAS_SNAPSHOT_LIB;
}
/** Seconds the 3D-canvas recorder films for: backend 'recorder3dcanvasduration' (default / fallback 20). */
async function readRecorder3dCanvasDuration(): Promise<number> {
  if (isMockMode() && !(ENABLE_TEST_REAL_UPLOAD && ENABLE_TEST_REAL_DOWNLOAD)) return DEFAULT_RECORDER_3D_DURATION_S;
  return (await readBackendFlags())?.recorder3dcanvasduration ?? DEFAULT_RECORDER_3D_DURATION_S;
}
/** true = show the RevenueCat top-up modal; false (default, or any failure) = the "daily credits reset tomorrow" sheet. */
async function readShowRevenueCat(): Promise<boolean> {
  if (isMockMode() && !ENABLE_TEST_REAL_CREDIT) return MOCK_SHOW_REVENUECAT;
  return (await readBackendFlags())?.showrevenuecat ?? false;
}

/** true = write one LogDetail row per action; backend 'islogdetail' (default false, also on any failure). MOCK mode only logs to the console. */
async function readIsLogDetail(): Promise<boolean> {
  if (isMockMode() && !ENABLE_TEST_REAL_CREDIT) return false;
  return (await readBackendFlags())?.islogdetail ?? false;
}

/** 'iOS' | 'android' | 'web' (stored in UserSettings.deviceos and LogDetail.deviceos). */
const DEVICE_OS: string = Platform.OS === 'ios' ? 'iOS' : Platform.OS;

/** When the user pressed the button of each action; the elapsed time of the log is measured from here. */
const actionStartedAt: Partial<Record<CreditAction, number>> = {};
const markActionStart = (action: CreditAction) => {
  actionStartedAt[action] = Date.now();
};
/**
 * Writes one LogDetail row (deviceuuid, deviceos, prompt, imagefullpath, creationdate, actionname, elapsedtime in ms) when the backend
 * flag 'islogdetail' is true. Call it when the action ENDS (file arrived, failed or timed out). Never throws and never blocks the UI:
 * call it as `void logActionDetail(...)`. The schema has no status field, so a failure / timeout is a row too (elapsed = time until the failure).
 */
async function logActionDetail(l: { action: CreditAction; prompt: string; imagePath?: string }): Promise<void> {
  try {
    const started = actionStartedAt[l.action];
    actionStartedAt[l.action] = undefined;
    const elapsed = started ? Math.max(0, Date.now() - started) : 0; // measured now, before any network call
    if (!(await readIsLogDetail())) return;
    const deviceuuid = await getDeviceUUID();
    await gql(createLogDetail, {
      input: {
        deviceuuid,
        deviceos: DEVICE_OS,
        actionname: l.action,
        prompt: (l.prompt ?? '').slice(0, 2000),
        imagefullpath: l.imagePath ?? '',
        creationdate: new Date().toISOString(),
        elapsedtime: Math.min(elapsed, 2147483647),
      },
    });
    console.log(`[Magic3DStudio] log detail written: ${l.action} ${elapsed} ms ${l.imagePath ?? ''}`);
  } catch (e) {
    console.warn('[Magic3DStudio] could not write the log detail', e);
  }
}

/** Writes a small text file into the cache folder and returns its file:// uri. */
function writeCacheText(name: string, text: string): string {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(text);
  return f.uri;
}

/**
 * Keeps a scene's files beside its Library item (document folder, survives cache clean-ups): writes `text` or copies the
 * downloaded file `uri` to <documents>/magic3d/<itemId>/<name>. Returns the saved file:// uri, or undefined on failure.
 */
function persistItemFile(itemId: string, name: string, src: { text: string } | { uri: string }): string | undefined {
  try {
    const dir = new Directory(Paths.document, 'magic3d', itemId);
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, name);
    if (dest.exists) dest.delete();
    if ('text' in src) {
      dest.create();
      dest.write(src.text);
    } else {
      new File(src.uri).copy(dest);
    }
    return dest.uri;
  } catch (e) {
    console.warn(`[Magic3DStudio] could not keep ${name} for the Library item`, e);
    return undefined;
  }
}

/**
 * Downloads the scene spec (<name>.json, written by the cloud next to the page) as soon as it exists, and gives up after the same
 * timeout as the page ('workflowtimeout'). Not finding it is not an error: Retouch then reports "not enough data".
 */
async function watchSceneSpec(job: SceneJob, opts: { signal: { aborted: boolean } }, onSpec: (uri: string) => void): Promise<void> {
  const name = job.names?.specFile;
  if (!name) return;
  const simulated = shouldSimulateCloud();
  const deadline = Date.now() + (await readWorkflowTimeoutMs());
  while (Date.now() < deadline && !opts.signal.aborted) {
    let uri: string | null = null;
    try {
      if (simulated) {
        if (Date.now() - job.startedAt >= SCENE_SIM_DURATION_MS) uri = writeCacheText(`${job.jobId}-${name}`, JSON.stringify({ mock: true, version: 1 }));
      } else {
        uri = (await downloadSceneFile(job.jobId, name))?.uri ?? null;
      }
    } catch (e) {
      console.warn('[Magic3DStudio] scene spec check failed', e);
    }
    if (uri) {
      if (!opts.signal.aborted) onSpec(uri);
      return;
    }
    await sleep(simulated ? 700 : SCENE_POLL_INTERVAL_MS);
  }
  console.log(`[Magic3DStudio] no scene spec (${name}) arrived before the timeout`);
}

/** Retouch file names (the device uuid is always the LAST part of a name, once), same idea as Harmonize: <key>-4retouch-<device>.* goes up, <key>-retouch-<device>.html comes back. */
type RetouchNames = { htmlFile: string; specFile: string; imageFile: string; /** snapshot of the live 3D view (optional extra) */ snapshotFile: string; /** uploaded LAST: it triggers the cloud Lambda */ txtFile: string; resultHtml: string; resultSpec: string };
function buildRetouchNames(key: string, deviceId: string): RetouchNames {
  const up = `${key}-4retouch-${deviceId}`;
  const res = `${key}-retouch-${deviceId}`;
  return { htmlFile: `${up}.html`, specFile: `${up}.json`, imageFile: `${up}.png`, snapshotFile: `${key}-4retouch-3dsnapshot-${deviceId}.png`, txtFile: `${up}.txt`, resultHtml: `${res}.html`, resultSpec: `${res}.json` };
}

/** Uploads the Retouch inputs: html page, scene spec json, scene image (JPEG named .png) and, when there is one, the 3D snapshot, then the .txt trigger. Throws on failure or timeout. */
async function uploadRetouchInputs(jobId: string, names: RetouchNames, html: string, spec: string, prompt: string, sceneImageUri?: string, snapshotUri?: string | null): Promise<void> {
  try {
    await withTimeout(
      (async () => {
        const dir = `public/scenes/${jobId}/`;
        const jobs: Promise<unknown>[] = [
          uploadData({ path: dir + names.htmlFile, data: html, options: { contentType: 'text/html' } }).result,
          uploadData({ path: dir + names.specFile, data: spec, options: { contentType: 'application/json' } }).result,
        ];
        // The scene picture is helpful, not required: the page + scene spec carry the scene itself. If it cannot be prepared or
        // uploaded, the Retouch carries on and the cloud works without it.
        if (sceneImageUri) {
          jobs.push(
            (async () => {
              try {
                const enc = await encodeUploadJpeg(sceneImageUri);
                console.log(`[Magic3DStudio] retouch upload: scene image ${enc.w}x${enc.h} JPEG ${(enc.data.byteLength / 1048576).toFixed(2)} MB`);
                await uploadData({ path: dir + names.imageFile, data: enc.data, options: { contentType: 'image/jpeg' } }).result;
              } catch (e) {
                console.warn('[Magic3DStudio] retouch: scene image not uploaded (continuing without it)', e);
              }
            })(),
          );
        } else console.warn('[Magic3DStudio] retouch: no picture to send, the cloud retouches from the page and the scene spec only');
        // The 3D snapshot is a nice-to-have: if it cannot be prepared or uploaded, the Retouch carries on with the other files.
        if (snapshotUri) {
          jobs.push(
            (async () => {
              try {
                if (isRecorderSnapshotUri(snapshotUri)) {
                  // already a PNG written by the recorder: upload its bytes untouched
                  const data = await new File(snapshotUri).arrayBuffer();
                  await uploadData({ path: dir + names.snapshotFile, data, options: { contentType: 'image/png' } }).result;
                  console.log(`[Magic3DStudio] retouch upload: 3D snapshot PNG ${(data.byteLength / 1048576).toFixed(2)} MB -> ${names.snapshotFile}`);
                } else {
                  // MOCK mode: the scene image stands in for the snapshot (JPEG data under the .png name, like the scene image itself)
                  const enc = await encodeUploadJpeg(snapshotUri);
                  await uploadData({ path: dir + names.snapshotFile, data: enc.data, options: { contentType: 'image/jpeg' } }).result;
                  console.log(`[Magic3DStudio] retouch upload: 3D snapshot (scene image stand-in) ${enc.w}x${enc.h} JPEG ${(enc.data.byteLength / 1048576).toFixed(2)} MB -> ${names.snapshotFile}`);
                }
              } catch (e) {
                console.warn('[Magic3DStudio] retouch: 3D snapshot not uploaded (continuing without it)', e);
              }
            })(),
          );
        }
        await Promise.all(jobs);
        await confirmUploaded([dir + names.htmlFile, dir + names.specFile]);
        // the .txt (same name) goes up last: its arrival triggers the Lambda, so by then the other three files are in storage
        await uploadData({ path: dir + names.txtFile, data: prompt.trim() || 'Retouch this 3D scene', options: { contentType: 'text/plain' } }).result;
        console.log('[Magic3DStudio] uploaded retouch inputs (trigger:', names.txtFile + ') for', names.resultHtml);
      })(),
      UPLOAD_TIMEOUT_MS,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg === 'timeout' ? `Retouch upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s` : `Retouch upload failed: ${msg}`);
  }
}

/** The cloud is simulated ONLY in MOCK mode (sample page after SCENE_SIM_DURATION_MS) unless ENABLE_TEST_REAL_DOWNLOAD is on. PRODUCTION never simulates. */
const shouldSimulateCloud = () => isMockMode() && !ENABLE_TEST_REAL_DOWNLOAD;
const SCENE_SIM_DURATION_MS = 5000;
const SCENE_POLL_INTERVAL_MS = 3000;
const SCENE_POLL_TIMEOUT_MS = CLOUD_SCENE_TIMEOUT_MS; // fallback when the backend has no usable 'workflowtimeout'

/** Backend stores 'workflowtimeout' as a string of seconds (e.g. "180"). Returns ms, or null when missing / not a positive number. */
function parseWorkflowTimeoutMs(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000);
}
let workflowTimeoutMsCache: number | null = null;
/** Reads 'workflowtimeout' from the global MagicStudioSettings row; falls back to 120 s on any failure. Cached after a good read. */
async function readWorkflowTimeoutMs(): Promise<number> {
  if (workflowTimeoutMsCache) return workflowTimeoutMsCache;
  try {
    const data = await gql<any>(listMagicStudioSettings, { limit: 1 });
    const row = data?.listMagicStudioSettings?.items?.find((x: any) => x) ?? null;
    const ms = parseWorkflowTimeoutMs(row?.workflowtimeout);
    if (ms) {
      workflowTimeoutMsCache = ms;
      console.log(`[Magic3DStudio] workflowtimeout from backend: ${ms / 1000}s`);
      return ms;
    }
    console.warn(`[Magic3DStudio] workflowtimeout missing/invalid (${String(row?.workflowtimeout)}) - using ${SCENE_POLL_TIMEOUT_MS / 1000}s`);
  } catch (e) {
    console.warn('[Magic3DStudio] could not read workflowtimeout - using the default', e);
  }
  return SCENE_POLL_TIMEOUT_MS;
}

type ScenePoll = { status: 'pending'; retryInMs?: number } | { status: 'done'; html: string } | { status: 'failed'; error: string };

/**
 * One status check of the cloud job.
 * TODO(production): replace the simulation with the real call, e.g.
 *  *   // or downloadData({ path: `public/scenes/${job.jobId}/scene.html` }) once the pipeline writes its result there
 *   -> map "queued/running" to { status: 'pending' }, "succeeded" to { status: 'done', html }, errors to { status: 'failed' }.
 */
async function pollSceneJob(job: SceneJob): Promise<ScenePoll> {
  if (shouldSimulateCloud()) {
    const left = SCENE_SIM_DURATION_MS - (Date.now() - job.startedAt);
    if (left > 0) return { status: 'pending', retryInMs: Math.min(SCENE_POLL_INTERVAL_MS, left) }; // like a Retry-After hint
    return { status: 'done', html: await mockSceneHtml() };
  }
  // PRODUCTION: the cloud writes <name>.html next to the upload; it is downloaded as soon as it exists.
  const name = job.names?.htmlFile ?? 'scene.html';
  const local = await downloadSceneFile(job.jobId, name);
  if (!local) return { status: 'pending' };
  try {
    return { status: 'done', html: await local.text() };
  } catch (e) {
    console.warn('[Magic3DStudio] could not read the downloaded scene page', e);
    return { status: 'pending' };
  }
}

/**
 * Checks that `public/scenes/<jobId>/<name>` exists in storage (getUrl with validateObjectExistence) and, if so, downloads it
 * into the cache folder with expo-file-system. Resolves with the local File, or null while the cloud has not produced it yet.
 */
async function downloadSceneFile(jobId: string, name: string): Promise<File | null> {
  let url: string;
  try {
    const res = await getUrl({
      path: `public/scenes/${jobId}/${name}`,
      options: { validateObjectExistence: true, expiresIn: 300 },
    });
    url = res.url.toString();
  } catch (e: any) {
    // not generated yet: the normal "keep waiting" case. Anything else is worth a log line.
    const missing = e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404 || /not.?found|404/i.test(String(e?.message ?? ''));
    if (!missing) console.warn(`[Magic3DStudio] storage check failed for ${name}`, e);
    return null;
  }
  try {
    const dest = new File(Paths.cache, `${jobId}-${name}`);
    const file = await File.downloadFileAsync(url, dest, { idempotent: true });
    console.log(`[Magic3DStudio] downloaded ${name} -> ${file.uri}`);
    return file;
  } catch (e) {
    console.warn(`[Magic3DStudio] download failed for ${name} (will retry)`, e);
    return null;
  }
}

/** true = the downloaded front / left / right / back images are cut out (background removed) before they are shown or saved. */
const REMOVE_BG_FROM_ANGLE_IMAGES = true;
/** The 'scene' image is a finished composition (product + environment), so only the product angles are cut out. */
const isProductAngle = (angle: CloudAngle) => angle !== 'scene';

/**
 * Runs a downloaded angle image through the background remover and returns the cut-out with EXACTLY the size of the
 * downloaded image (the remover is asked to scale its output back to the original, and a Skia resize guards the rest).
 * Never throws: when anything fails the original image is returned, so a good angle image is never lost.
 */
async function removeAngleBackground(uri: string, angle: CloudAngle): Promise<string> {
  try {
    const t0 = Date.now();
    const original = await loadSkImage(uri);
    const [cut, cutUri] = await removeBackground_Native_v2(
      uri,
      false, // isDownScaleInput: keep full resolution in
      false, // isDownScaleOutput
      true, // isScaleOutputToOriginal: output = original size
      'triangulation',
      true, // isSavedToFile
    );
    if (!cut) throw new Error('Background removal returned no image');
    let outImage: SkImage = cut;
    let outUri = cutUri;
    if (cut.width() !== original.width() || cut.height() !== original.height()) {
      // Safety net: the output must match the downloaded image, so scale it back (transparent canvas, alpha kept).
      outImage = renderToImage(original.width(), original.height(), (c) => {
        c.clear(Skia.Color('transparent'));
        c.drawImageRect(cut, fullRect(cut), Skia.XYWHRect(0, 0, original.width(), original.height()), Skia.Paint());
      });
      outUri = '';
    }
    // Backend 'backgroundforangleimage': 'white' paints the cut-out on white (same Skia helper as the scene upload); default / fallback = transparent.
    const { backgroundforangleimage } = await readSceneUploadSettings();
    if (backgroundforangleimage === 'white') {
      outImage = applySceneBackground(outImage, outImage.width(), outImage.height(), 'white');
      outUri = ''; // the saved file is still the transparent one, so register the flattened image instead
    }
    // The 3D textures / views are read from IMAGE_CACHE, so the cut-out is registered under the uri the app will use.
    const finalUri = outUri || registerImage(outImage, false);
    IMAGE_CACHE.set(finalUri, outImage);
    console.log(`[Magic3DStudio] ${angle} cut-out ${original.width()}x${original.height()} -> ${outImage.width()}x${outImage.height()} bg=${backgroundforangleimage} in ${Date.now() - t0} ms`);
    return finalUri;
  } catch (e) {
    console.warn(`[Magic3DStudio] background removal failed for the ${angle} image - keeping the original`, e);
    return uri;
  }
}

/**
 * One check for one extra angle image: downloads it once the cloud has written it and resolves with its local uri, otherwise null.
 * front / left / right / back are cut out after the download (same size as the downloaded image); 'scene' is returned as is.
 */
async function pollAngleImage(job: SceneJob, angle: CloudAngle): Promise<string | null> {
  if (!job.names) return null;
  const file = await downloadSceneFile(job.jobId, job.names.angleFile(angle));
  if (!file) return null;
  return REMOVE_BG_FROM_ANGLE_IMAGES && isProductAngle(angle) ? removeAngleBackground(file.uri, angle) : file.uri; // local file:// uri
}

/**
 * Watches every requested angle independently (the cloud runs them async, so they arrive in any order) and calls
 * `onImage` as soon as each one is available. Resolves when all arrived, the timeout hit or `signal` aborted.
 * In simulation (MOCK mode only) the images come from `sim` after staggered delays, order left-back-front-right-scene.
 */
async function watchAngleImages(
  job: SceneJob,
  onImage: (angle: CloudAngle, uri: string) => void,
  opts: { signal: { aborted: boolean }; sim?: Partial<Record<CloudAngle, string>>; intervalMs?: number; timeoutMs?: number },
): Promise<void> {
  const names = job.names;
  if (!names || !names.angles.length) return;
  const pending = new Set<CloudAngle>(names.angles);
  const simulated = shouldSimulateCloud();
  const simOrder: CloudAngle[] = ['left', 'back', 'front', 'right', 'scene'];
  const interval = opts.intervalMs ?? SCENE_POLL_INTERVAL_MS;
  const deadline = Date.now() + (opts.timeoutMs ?? CLOUD_FILE_TIMEOUT_MS);
  while (pending.size && Date.now() < deadline && !opts.signal.aborted) {
    await Promise.all(
      [...pending].map(async (a) => {
        let uri: string | null = null;
        if (simulated) {
          const due = 2000 + simOrder.indexOf(a) * 1500;
          if (Date.now() - job.startedAt >= due) uri = opts.sim?.[a] ?? null;
        } else {
          uri = await pollAngleImage(job, a);
        }
        if (uri && !opts.signal.aborted && pending.delete(a)) onImage(a, uri);
      }),
    );
    if (pending.size) await sleep(simulated ? 700 : interval);
  }
}

/**
 * Step 2: asks the cloud for the result every 3 seconds until the generated Three.js page (a full HTML string) is
 * ready. Resolves with the HTML; rejects on failure, timeout or abort.
 */
async function get3DScene(job: SceneJob, opts: { intervalMs?: number; timeoutMs?: number; signal?: { aborted: boolean }; onPoll?: (attempt: number) => void } = {}): Promise<string> {
  const interval = opts.intervalMs ?? SCENE_POLL_INTERVAL_MS;
  const deadline = Date.now() + (opts.timeoutMs ?? (await readWorkflowTimeoutMs()));
  for (let attempt = 1; ; attempt++) {
    if (opts.signal?.aborted) throw new Error('Scene request cancelled');
    opts.onPoll?.(attempt);
    const r = await pollSceneJob(job);
    if (r.status === 'done') return r.html;
    if (r.status === 'failed') throw new Error(r.error || 'Scene generation failed');
    if (Date.now() + interval > deadline) throw new Error('Scene generation timed out');
    await sleep(r.retryInMs ?? interval);
  }
}

async function runProductPipeline(imageUri: string, onStep: (i: number) => void): Promise<ProductAsset> {
  onStep(0);
  const [, cleanFromBg] = await Services.removeBackground(imageUri);
  // MOCK + bundled images: the platform images and the camera foreground use the same shoe as the four views.
  let cleanUri = cleanFromBg;
  if (isMockMode() && USE_BUNDLED_MOCK_IMAGES && !useRealForeground()) {
    try {
      cleanUri = await bundledMockUri('front');
    } catch {
      /* keep the procedural cut-out */
    }
  }
  onStep(1);
  const views = await Services.generateViews(cleanUri);
  let step = 2;
  if (ENABLE_DEPTH_MAPS) {
    onStep(step++);
    const depth = await Services.generateDepth(views);
    VIEW_ORDER.forEach((l) => (views[l] = { ...views[l], depthUri: depth[l] }));
  }
  const metadata = await readProductMetadata(views);
  return { id: uid(), originalImageUri: imageUri, cleanImageUri: cleanUri, views, metadata };
}

// ---- 5.2a Harmonize: exact-position blend of camera photo + 3D foreground ----------

type CapturedPhoto = { uri: string; width: number; height: number; orientation?: number };
/** Raw RGBA (premultiplied, bottom-up GL rows) read back from the 3D canvas at the moment of capture. */
type ForegroundSnapshot = { width: number; height: number; pixels: Uint8Array };
/** Filled by the camera background (takePhoto) and by the 3D canvas (snapshotForeground). */
type CaptureHandle = {
  takePhoto?: () => Promise<CapturedPhoto | null>;
  snapshotForeground?: () => ForegroundSnapshot | null;
};
type HarmonizeStage = 'capturing' | 'blending' | 'harmonizing';

/**
 * Finger-driven placement of the 3D product in Camera Studio. Stored as FRACTIONS of the preview box
 * (x of its width, y of its height, from the product's default position) so it is resolution independent
 * and the Harmonize snapshot reproduces it exactly. `rot` is clockwise radians on screen.
 */
type UserXform = { x: number; y: number; scale: number; rot: number; holding: boolean };
const newUserXform = (): UserXform => ({ x: 0, y: 0, scale: 1, rot: 0, holding: false });
const USER_SCALE_MIN = 0.25;
const USER_SCALE_MAX = 5;

const HARMONIZE_MAX_SIDE = 1536;
/** The snapshot is shrunk to this fraction before upload (less to send, less for the cloud to process) and the result is scaled back up with Skia. */
const HARMONIZE_UPLOAD_SCALE = 0.5;
/**
 * Measured on device (Expo Go): the time before an upload starts grows with the FILE SIZE (0.77 MB ~ 4.7 s, 3 MB ~ 19 s, even for
 * the tiny prompt file queued behind it), i.e. the JS-side hashing of the body, not the network. A JPEG of the same snapshot is
 * ~6x smaller than the PNG. When true, JPEG bytes are uploaded under the usual `.png` name (content-type image/jpeg): only turn it
 * on if the cloud workflow decodes by content (e.g. PIL / ffmpeg) and does not insist on real PNG data.
 */
const HARMONIZE_UPLOAD_JPEG = false;

/** Default prompt, uploaded next to the snapshot as a .txt file. The cloud pipeline reads it from there. */
const HARMONIZE_PROMPT =
  'Harmonize this image, transform the image so the foreground image blended seamlessly and naturally with the background image, make sure to make a beautiful image with studio quality lighting and color grading, super quality, super resolution';
/** How long to wait for the harmonized image to appear in storage and download (default 30 seconds). */
const HARMONIZE_TIMEOUT_MS = 90_000;
const HARMONIZE_POLL_INTERVAL_MS = 3_000;

function drawImageSmooth(
  c: SkCanvas,
  img: SkImage,
  src: ReturnType<typeof Skia.XYWHRect>,
  dst: ReturnType<typeof Skia.XYWHRect>,
  paint: ReturnType<typeof Skia.Paint>,
) {
  const any = c as any;
  if (typeof any.drawImageRectOptions === 'function') any.drawImageRectOptions(img, src, dst, FilterMode.Linear, MipmapMode.Linear, paint);
  else c.drawImageRect(img, src, dst, paint);
}

/** Reads the EXIF Orientation tag (1..8) straight from the JPEG bytes. Returns null if there is none. */
function readJpegOrientation(bytes: Uint8Array): number | null {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let off = 2;
  while (off + 4 < bytes.length) {
    if (bytes[off] !== 0xff) return null;
    const marker = bytes[off + 1];
    if (marker === 0xda || marker === 0xd9) return null; // image data starts: no EXIF
    const len = (bytes[off + 2] << 8) | bytes[off + 3];
    if (marker === 0xe1 && bytes[off + 4] === 0x45 && bytes[off + 5] === 0x78 && bytes[off + 6] === 0x69 && bytes[off + 7] === 0x66) {
      const tiff = off + 10;
      const le = bytes[tiff] === 0x49; // "II" = little endian
      const u16 = (o: number) => (le ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1]);
      const u32 = (o: number) =>
        (le ? bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24) : (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > bytes.length) return null;
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > bytes.length) return null;
        if (u16(e) === 0x0112) {
          const v = u16(e + 8);
          return v >= 1 && v <= 8 ? v : null;
        }
      }
      return null;
    }
    off += 2 + len;
  }
  return null;
}

/** EXIF orientation -> how to turn the stored pixels upright: optional horizontal flip first, then rotate clockwise. */
const EXIF_TRANSFORMS: Record<number, { rot: 0 | 90 | 180 | 270; flip: boolean }> = {
  1: { rot: 0, flip: false },
  2: { rot: 0, flip: true },
  3: { rot: 180, flip: false },
  4: { rot: 180, flip: true },
  5: { rot: 270, flip: true },
  6: { rot: 90, flip: false },
  7: { rot: 90, flip: true },
  8: { rot: 270, flip: false },
};
const PHOTO_MAX_SIDE = 2560;

function applyExifOrientation(img: SkImage, orientation: number): SkImage {
  const t = EXIF_TRANSFORMS[orientation];
  if (!t || (t.rot === 0 && !t.flip)) return img;
  const w = img.width();
  const h = img.height();
  const swap = t.rot === 90 || t.rot === 270;
  const ow = swap ? h : w;
  const oh = swap ? w : h;
  const k = Math.min(1, PHOTO_MAX_SIDE / Math.max(ow, oh)); // keep the working image a sensible size
  return renderToImage(Math.max(1, Math.round(ow * k)), Math.max(1, Math.round(oh * k)), (c) => {
    c.scale(k, k);
    if (t.rot === 90) {
      c.translate(h, 0);
      c.rotate(90, 0, 0);
    } else if (t.rot === 180) {
      c.translate(w, h);
      c.rotate(180, 0, 0);
    } else if (t.rot === 270) {
      c.translate(0, w);
      c.rotate(-90, 0, 0);
    }
    if (t.flip) {
      c.translate(w, 0);
      c.scale(-1, 1);
    }
    drawImageSmooth(c, img, fullRect(img), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  });
}

/**
 * Decodes the camera photo and makes it UPRIGHT. Skia ignores EXIF, so a portrait shot is stored as a sideways
 * landscape image + a tag; without this the blend comes out rotated 90 degrees.
 * Order of trust: tag read from the file -> tag reported by expo-camera -> "portrait preview but landscape pixels".
 */
async function loadUprightPhoto(photo: CapturedPhoto, previewAspect: number): Promise<SkImage> {
  const cached = IMAGE_CACHE.get(photo.uri);
  if (cached) return cached; // generated (mock) photos are already upright
  const data = await Skia.Data.fromURI(photo.uri);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (!img) throw new Error('Could not decode the camera photo');
  const w = img.width();
  const h = img.height();
  let orientation: number | null = null;
  let source = 'none';
  try {
    const bytes = (data as any).bytes?.() as Uint8Array | undefined;
    const fromFile = bytes && bytes.length ? readJpegOrientation(bytes) : null;
    if (fromFile) {
      orientation = fromFile;
      source = 'file-exif';
    }
  } catch (e) {
    console.warn('[Magic3DStudio] could not read EXIF from the photo file', e);
  }
  if (orientation === null && typeof photo.orientation === 'number' && photo.orientation >= 1 && photo.orientation <= 8) {
    orientation = photo.orientation;
    source = 'camera-exif';
  }
  // Tags 5-8 describe SIDEWAYS pixels. If the pixels are already portrait, the rotation was baked in: do nothing.
  if (orientation !== null && orientation >= 5 && w < h) {
    orientation = 1;
    source += '+already-upright';
  }
  // No usable tag, but the preview is portrait and the pixels are landscape: it is a sideways portrait shot.
  if ((orientation === null || orientation === 1) && previewAspect < 1 && w > h) {
    orientation = 6;
    source = 'aspect-fallback';
  }
  console.log(`[Magic3DStudio] photo ${w}x${h}: EXIF orientation ${orientation ?? 1} (${source})`);
  return orientation && orientation !== 1 ? applyExifOrientation(img, orientation) : img;
}

/**
 * Blends the camera photo with the 3D product so the product lands EXACTLY where the live preview shows it.
 * The preview shows the photo "cover"-fitted into the preview box (centre-crop), and the GL snapshot has the
 * box's aspect ratio, so: centre-crop the photo to the snapshot's aspect, then draw the snapshot over all of it.
 */
async function composeCameraBlend(photo: CapturedPhoto, fg: ForegroundSnapshot): Promise<{ blendedUri: string; maskUri: string; width: number; height: number }> {
  const src = await loadUprightPhoto(photo, fg.width / fg.height);
  const sw = src.width();
  const sh = src.height();
  const aspect = fg.width / fg.height;
  let cw = sw;
  let ch = sh;
  if (sw / sh > aspect) cw = sh * aspect;
  else ch = sw / aspect;
  const cx = (sw - cw) / 2;
  const cy = (sh - ch) / 2;
  const { w, h } = fitSize(Math.round(cw), Math.round(ch), HARMONIZE_MAX_SIDE);

  const fgImg = Skia.Image.MakeImage(
    { width: fg.width, height: fg.height, alphaType: AlphaType.Premul, colorType: ColorType.RGBA_8888 },
    Skia.Data.fromBytes(fg.pixels),
    fg.width * 4,
  );
  if (!fgImg) throw new Error('Could not build the foreground image');
  const drawFg = (c: SkCanvas, paint: ReturnType<typeof Skia.Paint>) => {
    c.save();
    c.translate(0, h); // GL rows are bottom-up
    c.scale(1, -1);
    drawImageSmooth(c, fgImg, fullRect(fgImg), Skia.XYWHRect(0, 0, w, h), paint);
    c.restore();
  };

  const blended = renderToImage(w, h, (c) => {
    drawImageSmooth(c, src, Skia.XYWHRect(cx, cy, cw, ch), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
    drawFg(c, Skia.Paint());
  });
  // White product silhouette on black: lets the harmonize API know which pixels were pasted in.
  // Only the offline mock harmonizer reads the mask; the real round trip uploads just the blended snapshot, so skip a full-size render.
  const mask = shouldUseRealUpload()
    ? null
    : renderToImage(w, h, (c) => {
        c.clear(Skia.Color('#000000'));
        const p = Skia.Paint();
        p.setColorFilter(Skia.ColorFilter.MakeMatrix(WHITE_MATRIX));
        drawFg(c, p);
      });
  // Write the PNG once to a real file: it is shown, saved and uploaded from there (no base64 string, no decode again).
  const blendedUri = imageToCacheFile(blended, `harmonize_blend_${Date.now()}`) ?? registerImage(blended, true);
  return { blendedUri, maskUri: mask ? registerImage(mask, false) : '', width: w, height: h };
}
/** Encodes `img` as PNG into a file the app can read back (file:// uri), and keeps the decoded image cached. Null if writing failed. */
function imageToCacheFile(img: SkImage, name: string): string | null {
  try {
    const bytes = img.encodeToBytes(ImageFormat.PNG, 100);
    let uri = writeToFile(`${name}.png`, bytes);
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) uri = `file://${uri.startsWith('/') ? '' : '/'}${uri}`;
    IMAGE_CACHE.set(uri, img);
    return uri;
  } catch (e) {
    console.warn('[Magic3DStudio] could not write the snapshot to a file - falling back to a data uri', e);
    return null;
  }
}

/** Offline stand-in for the harmonize API: a gentle grade + vignette so the before/after is visible in Expo Go. */
async function mockHarmonizeImage(blendedUri: string, _maskUri: string): Promise<string> {
  await sleep(2200);
  const src = await loadSkImage(blendedUri);
  const w = src.width();
  const h = src.height();
  const out = renderToImage(w, h, (c) => {
    const p = Skia.Paint();
    p.setColorFilter(Skia.ColorFilter.MakeMatrix([1.07, 0, 0, 0, 0.012, 0, 1.02, 0, 0, 0, 0, 0, 0.94, 0, 0, 0, 0, 0, 1, 0]));
    c.drawImage(src, 0, 0, p);
    const v = Skia.Paint();
    v.setShader(
      Skia.Shader.MakeRadialGradient({ x: w / 2, y: h / 2 }, Math.max(w, h) * 0.78, [Skia.Color('#00000000'), Skia.Color('#00000050')], [0.55, 1], TileMode.Clamp),
    );
    c.drawRect(Skia.XYWHRect(0, 0, w, h), v);
  });
  return registerImage(out, true);
}

/**
 * File-name convention shared with the cloud pipeline (device id always last):
 *   upload:  shoe-6868-4harmonize-afdc6789x23vzx21.png  (+ the same name with .txt for the prompt)
 *   returns: shoe-6868-harmonize-afdc6789x23vzx21.png   ('-4harmonize-' becomes '-harmonize-')
 */
type HarmonizeNames = { base: string; imageFile: string; promptFile: string; resultFile: string };
function buildHarmonizeNames(category: string | undefined, deviceId: string): HarmonizeNames {
  const base = `${category || 'photo'}-${Math.floor(1000 + Math.random() * 9000)}`;
  const imageFile = `${base}-4harmonize-${deviceId}.png`;
  return {
    base,
    imageFile,
    promptFile: `${base}-4harmonize-${deviceId}.txt`,
    resultFile: imageFile.replace('-4harmonize-', '-harmonize-'),
  };
}

/**
 * Uploads the blended snapshot + the default prompt to public/scenes/<jobId>/ (same storage area and the same
 * expo-file-system -> uploadData route as uploadProductPhoto). Throws on failure or after UPLOAD_TIMEOUT_MS.
 * The image goes first and the prompt (.txt) LAST: the .txt triggers the Lambda, so the image must already be complete in storage.
 */
async function uploadHarmonizeInputs(imageUri: string, jobId: string, names: HarmonizeNames, imageType: string = 'image/png'): Promise<void> {
  try {
    await withTimeout(
      (async () => {
        const tUp = Date.now();
        let lastPct = -1;
        const localUri = await ensureFileUri(imageUri, `harmonize_${jobId}`);
        const fileData = await new File(localUri).arrayBuffer();
        console.log(`[Magic3DStudio] harmonize upload: snapshot ${(fileData.byteLength / 1048576).toFixed(2)} MB read in ${Date.now() - tUp} ms, uploading…`);

        // ORDER: the image goes up first and is confirmed; the prompt (.txt) goes up LAST because its arrival triggers the Lambda,
        // which looks for the image straight away. (They used to upload at the same time, so the Lambda could start before the image was complete.)
        const image = await uploadData({
          path: `public/scenes/${jobId}/${names.imageFile}`,
          data: fileData,
          // progress log: tells "slow link" (bytes trickle in from the start) from "slow JS before sending" (nothing for a long time)
          options: {
            contentType: imageType,
            onProgress: ({ transferredBytes, totalBytes }) => {
              const pct = totalBytes ? Math.floor((transferredBytes / totalBytes) * 10) : 0;
              if (pct !== lastPct) {
                lastPct = pct;
                console.log(`[Magic3DStudio] harmonize upload progress: ${pct * 10}% at ${Date.now() - tUp} ms`);
              }
            },
          },
        }).result;
        console.log(`[Magic3DStudio] harmonize upload: image done after ${Date.now() - tUp} ms`);
        await confirmUploaded([image.path]);
        const text = await uploadData({ path: `public/scenes/${jobId}/${names.promptFile}`, data: HARMONIZE_PROMPT, options: { contentType: 'text/plain' } }).result;
        console.log(`[Magic3DStudio] harmonize upload: prompt (trigger) done after ${Date.now() - tUp} ms`);
        console.log('[Magic3DStudio] uploaded harmonize prompt:', text.path);
        console.log(`[Magic3DStudio] uploaded harmonize snapshot: ${image.path} (upload took ${Date.now() - tUp} ms in total)`);
      })(),
      UPLOAD_TIMEOUT_MS,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg === 'timeout' ? `Harmonize upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s` : `Harmonize upload failed: ${msg}`);
  }
}

/**
 * Checks storage for <base>-harmonize-<device>.png until it exists (or the timeout hits), downloads it and returns a
 * display-ready data URI (same kind of uri the mock returns, so the result sheet and library need no changes).
 */
async function waitForHarmonizedImage(jobId: string, names: HarmonizeNames, timeoutMs: number = HARMONIZE_TIMEOUT_MS, upscaleTo?: { w: number; h: number }): Promise<string> {
  let cancelled = false;
  try {
    return await withTimeout(
      (async () => {
        for (;;) {
          if (cancelled) throw new Error('cancelled');
          const file = await downloadSceneFile(jobId, names.resultFile);
          if (file) {
            const tUp = Date.now();
            const img = await loadSkImage(file.uri);
            // the cloud worked on the shrunken snapshot: bring the result back to the full size with Skia
            if (upscaleTo && (img.width() < upscaleTo.w || img.height() < upscaleTo.h)) {
              const big = renderToImage(upscaleTo.w, upscaleTo.h, (c) => {
                drawImageSmooth(c, img, fullRect(img), Skia.XYWHRect(0, 0, upscaleTo.w, upscaleTo.h), Skia.Paint());
              });
              const uri = imageToCacheFile(big, `harmonize_result_${Date.now()}`) ?? registerImage(big, true);
              console.log(`[Magic3DStudio] harmonize: result ${img.width()}x${img.height()} scaled up to ${upscaleTo.w}x${upscaleTo.h} in ${Date.now() - tUp} ms`);
              return uri;
            }
            return registerImage(img, true);
          }
          await sleep(HARMONIZE_POLL_INTERVAL_MS);
        }
      })(),
      timeoutMs,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'timeout') throw new Error(`Harmonized image not ready after ${timeoutMs / 1000}s`);
    throw e;
  } finally {
    cancelled = true; // stops the polling loop after a timeout
  }
}

/**
 * Harmonize entry point (used by Services.harmonize). The two test flags pick the branch, see the flag docs at the top:
 * upload is real when PRODUCTION or ENABLE_TEST_REAL_UPLOAD, download is real when PRODUCTION or ENABLE_TEST_REAL_DOWNLOAD.
 */
async function harmonizeImage(blendedUri: string, maskUri: string, category?: string): Promise<string> {
  const realUpload = shouldUseRealUpload();
  const realDownload = !isMockMode() || ENABLE_TEST_REAL_DOWNLOAD;
  if (!realUpload && !realDownload) return mockHarmonizeImage(blendedUri, maskUri);

  const jobId = uid();
  const names = buildHarmonizeNames(category, await getDeviceUUID());
  const logImage = `public/scenes/${jobId}/${names.imageFile}`;
  let full: { w: number; h: number } | undefined;
  try {
  if (realUpload) {
    // Shrink the snapshot before it goes up: a smaller file uploads faster and the cloud has less to harmonize.
    let toSend = blendedUri;
    let sendType = 'image/png';
    const tShrink = Date.now();
    try {
      const src = await loadSkImage(blendedUri);
      full = { w: src.width(), h: src.height() };
      const half = { w: Math.max(64, Math.round(full.w * HARMONIZE_UPLOAD_SCALE)), h: Math.max(64, Math.round(full.h * HARMONIZE_UPLOAD_SCALE)) };
      const { w, h } = fitSize(half.w, half.h, MAX_IMAGE_UPLOAD_SIZE); // never above MAX_IMAGE_UPLOAD_SIZE
      const small = renderToImage(w, h, (c) => {
        drawImageSmooth(c, src, fullRect(src), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
      });
      if (HARMONIZE_UPLOAD_JPEG) {
        let u = writeToFile(`harmonize_small_${Date.now()}.jpg`, small.encodeToBytes(ImageFormat.JPEG, 90));
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = `file://${u.startsWith('/') ? '' : '/'}${u}`;
        toSend = u;
        sendType = 'image/jpeg';
      } else {
        toSend = imageToCacheFile(small, `harmonize_small_${Date.now()}`) ?? blendedUri;
      }
      console.log(`[Magic3DStudio] harmonize: snapshot ${full.w}x${full.h} shrunk to ${w}x${h} in ${Date.now() - tShrink} ms`);
    } catch (e) {
      console.warn('[Magic3DStudio] harmonize: could not shrink the snapshot - uploading it at full size', e);
      full = undefined;
    }
    await uploadHarmonizeInputs(toSend, jobId, names, sendType);
  }
  else console.log('[Magic3DStudio] harmonize: upload skipped (ENABLE_TEST_REAL_UPLOAD is off)');

  if (!realDownload) {
    console.log('[Magic3DStudio] harmonize: download skipped (ENABLE_TEST_REAL_DOWNLOAD is off) - returning the mock result');
    return mockHarmonizeImage(blendedUri, maskUri);
  }
  return await waitForHarmonizedImage(jobId, names, HARMONIZE_TIMEOUT_MS, full);
  } finally {
    void logActionDetail({ action: 'harmonize', prompt: HARMONIZE_PROMPT, imagePath: logImage }); // result arrived, failed or timed out
  }
}

// ---- 5.2b screen recorder (expo-turbo-screen-recorder, lazy) ----------------------

type RecState = 'idle' | 'starting' | 'recording' | 'stopping';
type RecordOptions = { fps: number };
type RecordingResult = { uri?: string } | null | undefined;
type ScreenRecorderModuleShape = {
  /** Resolves false when the OS can't record right now. Always called before `startRecordingAsync`. */
  isAvailableAsync: () => Promise<boolean>;
  startRecordingAsync: (opts: { includeAudio?: boolean; quality?: string }) => Promise<unknown>;
  stopRecordingAsync: () => Promise<RecordingResult>;
};

let recorderCache: ScreenRecorderModuleShape | null | undefined;
/**
 * Never required in mock mode / Expo Go, so the native module is not needed there.
 * Install: `npx expo install expo-turbo-screen-recorder` (development build, not Expo Go).
 */
function loadScreenRecorder(): ScreenRecorderModuleShape | null {
  if (recorderCache !== undefined) return recorderCache;
  recorderCache = null;
  if (GLOBAL_MODE === 'MOCK') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-turbo-screen-recorder');
    const src = typeof mod?.startRecordingAsync === 'function' ? mod : mod?.default;
    if (typeof src?.startRecordingAsync === 'function' && typeof src?.stopRecordingAsync === 'function') {
      recorderCache = {
        isAvailableAsync: typeof src.isAvailableAsync === 'function' ? () => src.isAvailableAsync() : async () => true,
        startRecordingAsync: (o) => src.startRecordingAsync(o),
        stopRecordingAsync: () => src.stopRecordingAsync(),
      };
    } else {
      console.warn('[Magic3DStudio] expo-turbo-screen-recorder has no start/stopRecordingAsync. Keys:', mod ? Object.keys(mod) : mod);
    }
  } catch (e) {
    console.warn('[Magic3DStudio] require("expo-turbo-screen-recorder") failed - using the mock recorder.', e);
    recorderCache = null;
  }
  return recorderCache;
}

let mockRecordingStartedAt = 0;
/** Recorder facade used by the UI: the real recorder in a development build, a timed mock in MOCK mode / Expo Go. */
const ScreenRecorder = {
  isMock: () => GLOBAL_MODE === 'MOCK' || loadScreenRecorder() === null,

  async start(_opts: RecordOptions): Promise<void> {
    const recorder = loadScreenRecorder();
    if (recorder) {
      if (!(await recorder.isAvailableAsync())) throw new Error('Screen recording is not available right now');
      await recorder.startRecordingAsync({ includeAudio: false, quality: 'high' });
      mockRecordingStartedAt = Date.now();
      return;
    }
    await sleep(300);
    mockRecordingStartedAt = Date.now();
  },

  /** Resolves to the recorded file URI. */
  async stop(): Promise<string> {
    const recorder = loadScreenRecorder();
    if (recorder) {
      const res = await recorder.stopRecordingAsync();
      var uri = typeof res === 'string' ? (res as string) : res?.uri;
      if (!uri) throw new Error('The recorder returned no file');
      if (!uri.includes('://')) uri = `file://${uri}`;
      // await Sharing.shareAsync(uri);
      return uri;
    }
    await sleep(400);
    const secs = Math.max(1, Math.round((Date.now() - mockRecordingStartedAt) / 1000));
    return `file:///mock/magic3d-recording-${secs}s.mp4`;
  },
};

// ---- 5.3b cloud scene HTML (Film Studio main flow) ---------------------------------
const PAYLOAD_IMG_CACHE = new Map<string, string>();
/** The WebView can only load data: / blob: images (CSP). Turns a cached Skia image handle (mem://...) into a PNG data URI, max 1280 px on the long side. */
function toPayloadDataUri(uri: string | undefined, maxSide = 1280): string {
  if (!uri) return '';
  if (uri.startsWith('data:')) return uri;
  const hit = PAYLOAD_IMG_CACHE.get(uri);
  if (hit) return hit;
  const img = IMAGE_CACHE.get(uri);
  if (!img) return uri;
  try {
    const k = Math.min(1, maxSide / Math.max(img.width(), img.height()));
    const w = Math.max(1, Math.round(img.width() * k)), h = Math.max(1, Math.round(img.height() * k));
    const out = k < 1 ? renderToImage(w, h, (c) => c.drawImageRect(img, fullRect(img), Skia.XYWHRect(0, 0, w, h), Skia.Paint())) : img;
    const data = `data:image/png;base64,${out.encodeToBase64(ImageFormat.PNG, 100)}`;
    PAYLOAD_IMG_CACHE.set(uri, data);
    return data;
  } catch { return uri; }
}

/** What preset scenes read via window.__MAGIC3D__ (product textures + metadata). */
function buildProductPayload(asset: ProductAsset, hd: boolean) {
  const views: Record<string, string> = {};
  // VIEW_ORDER.forEach((l) => (views[l] = asset.views[l].imageUri));
  VIEW_ORDER.forEach((l) => (views[l] = toPayloadDataUri(asset.views[l].imageUri)));
  views.scene = toPayloadDataUri(asset.cleanImageUri);       // the customer's picture (cut-out), what the new pages show
  const depth: Record<string, string> = {};
  const du = asset.views.front.depthUri;
  const dImg = du ? IMAGE_CACHE.get(du) : undefined;
  if (dImg) depth.front = `data:image/png;base64,${dImg.encodeToBase64(ImageFormat.PNG, 100)}`;
  return {
    version: 1,
    product: { views, depth, metadata: asset.metadata },
    dpr: hd ? Math.min(2, PixelRatio.get()) : 1,
  };
}

/**
 * The sandboxed page can only load data: / blob: images (CSP img-src), so every view must be a data URI. Views that are file:// / https / mem://
 * (saved items, cloud images) are decoded and re-encoded here; one that cannot be read is dropped (the page then uses another view).
 */
async function toDataUriForPage(uri: string): Promise<string | null> {
  if (!uri) return null;
  if (uri.startsWith('data:')) return uri;
  try {
    const img = await loadSkImage(uri);
    return `data:image/png;base64,${img.encodeToBase64(ImageFormat.PNG, 100)}`;
  } catch (e) {
    console.warn('[Magic3DStudio] view not readable for the 3D page', uri.slice(0, 60), e);
    return null;
  }
}

async function buildProductPayloadAsync(asset: ProductAsset, hd: boolean) {
  const p = buildProductPayload(asset, hd);
  const views: Record<string, string> = {};
  for (const l of VIEW_ORDER) {
    const d = await toDataUriForPage(p.product.views[l]);
    if (d) views[l] = d;
  }
  p.product.views = views;
  return p;
}

/**
 * Runs BEFORE the page's own scripts: exposes window.__MAGIC3D__, reports ready/errors to React Native,
 * and wraps requestAnimationFrame so Pause freezes any animation loop the generated page runs.
 */
const PREVIEW_BOOTSTRAP_JS = String.raw`(function () {
  var cfg = __PAYLOAD__;
  var post = function (m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} };
  window.__MAGIC3D__ = cfg;
  if (cfg.dpr) { try { Object.defineProperty(window, 'devicePixelRatio', { get: function () { return cfg.dpr; } }); } catch (e) {} }
  var raf = window.requestAnimationFrame.bind(window);
  var paused = false, queue = [];
  window.requestAnimationFrame = function (cb) { if (paused) { queue.push(cb); return 0; } return raf(cb); };
  window.__M3D_setPaused = function (p) {
    paused = !!p;
    if (!paused) { var q = queue; queue = []; q.forEach(function (cb) { raf(cb); }); }
  };
  window.__M3D_setRecording = function (on) {
    try {
      var st = document.getElementById('m3d-rec-style');
      if (!st) { st = document.createElement('style'); st.id = 'm3d-rec-style'; (document.head || document.documentElement).appendChild(st); }
      st.textContent = on ? '[data-m3d-ui]{display:none !important}' : '';
    } catch (e) {}
  };
  window.addEventListener('error', function (e) {
    if (e && e.target && e.target !== window) {
      post({ type: 'error', fatal: true, message: 'Failed to load ' + (e.target.src || e.target.href || 'resource') });
    } else {
      post({ type: 'error', message: String((e && e.message) || 'Script error') });
    }
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    post({ type: 'error', message: String((e && e.reason && e.reason.message) || (e && e.reason) || 'Unhandled rejection') });
  });
  var frames = 0;
  (function tick() {
    raf(function () {
      frames++;
      if (document.querySelector('canvas') && frames > 3) { post({ type: 'ready' }); }
      else if (frames < 3600) { tick(); }
    });
  })();
})();`;

/** Injects CSP + bootstrap into the untrusted page (after the charset meta, before any other script). */
function buildPreviewHtml(raw: string, payload: unknown): string {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const csp = PREVIEW_CSP_ENABLED ? `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">` : '';
  const inject = `${csp}<script>${PREVIEW_BOOTSTRAP_JS.replace('__PAYLOAD__', () => json)}</script>`;
  const charset = /<meta[^>]*charset[^>]*>/i.exec(raw);
  if (charset) {
    const i = charset.index + charset[0].length;
    return raw.slice(0, i) + inject + raw.slice(i);
  }
  const head = /<head[^>]*>/i.exec(raw);
  if (head) {
    const i = head.index + head[0].length;
    return raw.slice(0, i) + inject + raw.slice(i);
  }
  return inject + raw;
}

// ---- 5.4 platform photos (Skia blend: product + color/image background) -------

function parsePlatformSpec(text: string): PlatformSpec[] {
  return text
    .split(',')
    .map((chunk) => {
      const kv: Record<string, string> = {};
      chunk.split(';').forEach((pair) => {
        const [k, ...rest] = pair.split('=');
        if (k) kv[k.trim().toLowerCase()] = rest.join('=').trim();
      });
      const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i.exec(kv.dimension ?? '');
      if (!kv.name || !m) return null;
      return { name: kv.name, width: +m[1], height: +m[2] };
    })
    .filter((x): x is PlatformSpec => !!x);
}

async function composePlatformImages(
  asset: ProductAsset,
  specs: PlatformSpec[],
  bg: PlatformBackground,
): Promise<PlatformImage[]> {
  const product = await loadSkImage(asset.cleanImageUri);
  const bgImg = bg.kind === 'image' ? await loadSkImage(bg.uri) : null;
  const out: PlatformImage[] = [];
  for (const s of specs) {
    const { w, h } = fitSize(s.width, s.height, 512); // preview resolution; export re-renders at s.width x s.height
    const img = renderToImage(w, h, (c) => {
      if (bgImg) {
        const k = Math.max(w / bgImg.width(), h / bgImg.height());
        const dw = bgImg.width() * k;
        const dh = bgImg.height() * k;
        c.drawImageRect(bgImg, fullRect(bgImg), Skia.XYWHRect((w - dw) / 2, (h - dh) / 2, dw, dh), Skia.Paint());
      } else {
        c.clear(Skia.Color((bg as { color: string }).color));
      }
      const k = Math.min((w * 0.82) / product.width(), (h * 0.82) / product.height());
      const pw = product.width() * k;
      const ph = product.height() * k;
      const x = (w - pw) / 2;
      const y = (h - ph) / 2;
      // contact shadow
      const sh = Skia.Paint();
      sh.setColor(Skia.Color('#00000040'));
      sh.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, pw * 0.04, true));
      c.drawOval(Skia.XYWHRect(x + pw * 0.12, y + ph * 0.86, pw * 0.76, ph * 0.08), sh);
      c.drawImageRect(product, fullRect(product), Skia.XYWHRect(x, y, pw, ph), Skia.Paint());
    });
    out.push({ name: s.name, dimension: `${s.width}x${s.height}`, uri: registerImage(img, true) });
  }
  return out;
}

// ---- 5.5 device id, credits (expo-sqlite), purchases (RevenueCat) ------------------

type Credits = { daily: number; total: number; day: string };
type CreditSource = 'api' | 'cache' | 'default';
type CreditAction = 'generate_3d_scene' | 'harmonize' | 'retouch_3d_scene';
type CreditPack = { id: string; title: string; credits: number; priceLabel: string; badge?: string; native?: unknown };

/** Used when the device id cannot be read from / stored in expo-sqlite. */
const DEVICE_ID_FALLBACK = 'guess';
/** Used when the credit API cannot be reached and nothing is cached yet. */
const DEFAULT_CREDITS = { daily: 1, total: 2 };
/**
 * Credit model
 *  - Global defaults (backend MagicStudioSettings, built-in fallback above): every new user starts with daily 1 / total 2.
 *  - total = the balance; daily = what is left of today's allowance. One action costs 1 from BOTH.
 *  - Daily allowance = the user's own limit when the backend has one (optional `dailylimit` field on UserSettings, e.g. 10),
 *    otherwise the global daily default. On a new day: daily = min(allowance, total).
 *  - A purchase adds its credits to BOTH daily and total (grantPurchasedCredits).
 */
let userDailyLimit: number | null = null;
const dailyAllowance = () => userDailyLimit ?? DEFAULT_CREDITS.daily;
/** What "daily" is set to on a new day: the allowance, but never more than the user can actually spend. */
const dailyOnNewDay = (total: number) => Math.max(0, Math.min(dailyAllowance(), total));
/** Dev switch: make the MOCK credit API fail so the cache / default fallback can be tested in Expo Go. */
const MOCK_CREDIT_API_OFFLINE = false;
const CREDIT_API_TIMEOUT_MS = 8000;

const REVENUECAT_CONFIG = {
  // TODO(production): paste the PUBLIC SDK keys from RevenueCat (Project settings -> API keys), one per platform.
  iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  androidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  // TODO(production): id of the offering that holds the credit packs ('' = the dashboard's "current" offering).
  offeringId: '',
  // TODO(production): replace with your real store product ids (create them as CONSUMABLES in App Store Connect /
  // Google Play, attach them to the offering in RevenueCat) and the credits each one grants.
  creditsByProductId: { magic3d_credits_10: 10, magic3d_credits_50: 50, magic3d_credits_200: 200 } as Record<string, number>,
};

const MOCK_CREDIT_PACKS: CreditPack[] = [
  { id: 'mock_10', title: 'Starter', credits: 10, priceLabel: '$1.99' },
  { id: 'mock_50', title: 'Creator', credits: 50, priceLabel: '$7.99', badge: 'BEST VALUE' },
  { id: 'mock_200', title: 'Studio', credits: 200, priceLabel: '$19.99' },
];

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Device id: 16 random lowercase letters and digits (safe inside file names). */
const DEVICE_ID_RE = /^[a-z0-9]{16}$/;
function generateUUID(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const c: any = (globalThis as any).crypto;
  const bytes: number[] = c?.getRandomValues ? Array.from(c.getRandomValues(new Uint8Array(16)) as Uint8Array) : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return bytes.map((b) => chars[b % chars.length]).join('');
}

// ---- expo-sqlite (lazy: if it is missing or fails we keep working in memory) ----

type SqliteDb = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...params: unknown[]) => Promise<unknown>;
  getFirstAsync: <T>(sql: string, ...params: unknown[]) => Promise<T | null>;
  getAllAsync: <T>(sql: string, ...params: unknown[]) => Promise<T[]>;
};
let dbPromise: Promise<SqliteDb | null> | null = null;
const memoryKv = new Map<string, string>();

function openDb(): Promise<SqliteDb | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const SQLite = require('expo-sqlite');
        const db = (await SQLite.openDatabaseAsync('magic3d.db')) as SqliteDb;
        await db.execAsync(
          'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);' +
            'CREATE TABLE IF NOT EXISTS credit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, device_id TEXT NOT NULL, action TEXT NOT NULL, daily_after INTEGER NOT NULL, total_after INTEGER NOT NULL);',
        );
        return db;
      } catch (e) {
        console.error('[Magic3DStudio] expo-sqlite unavailable - using memory only', e);
        return null;
      }
    })();
  }
  return dbPromise;
}

async function kvGet(key: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return memoryKv.get(key) ?? null;
  try {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    return row?.value ?? null;
  } catch (e) {
    console.error('[Magic3DStudio] sqlite read failed', e);
    return memoryKv.get(key) ?? null;
  }
}

async function kvSet(key: string, value: string): Promise<void> {
  memoryKv.set(key, value);
  const db = await openDb();
  if (!db) return;
  try {
    await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, value);
  } catch (e) {
    console.error('[Magic3DStudio] sqlite write failed', e);
  }
}

let deviceIdCache: string | null = null;
/** Stable per-install id kept in expo-sqlite. Falls back to 'guess' if sqlite cannot provide one. */
/**
 * The device id is also kept in expo-secure-store (optional package, loaded lazily): if expo-sqlite is wiped, the same id
 * is restored so the backend credit record is found again. (iOS keychain even survives an uninstall; Android does not.)
 */
const DEVICE_ID_SECURE_KEY = 'magic3d_device_uuid';
async function secureDeviceId(value?: string): Promise<string | null> {
  try {
    const SS = require('expo-secure-store');
    if (value) {
      await SS.setItemAsync(DEVICE_ID_SECURE_KEY, value);
      return value;
    }
    const v = await SS.getItemAsync(DEVICE_ID_SECURE_KEY);
    return v && DEVICE_ID_RE.test(v) ? v : null;
  } catch {
    return null; // package not installed / keychain unavailable
  }
}

async function getDeviceUUID(): Promise<string> {
  if (deviceIdCache) return deviceIdCache;
  try {
    const db = await openDb();
    if (!db) return DEVICE_ID_FALLBACK;
    const existing = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', 'device_uuid');
    if (existing?.value && DEVICE_ID_RE.test(existing.value)) {
      deviceIdCache = existing.value;
      secureDeviceId(existing.value); // keep the backup copy in step
      return existing.value;
    }
    const restored = await secureDeviceId(); // sqlite was wiped: get the old id back
    const fresh = restored ?? generateUUID();
    if (restored) console.log('[Magic3DStudio] device id restored from secure storage');
    else secureDeviceId(fresh);
    await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', 'device_uuid', fresh);
    deviceIdCache = fresh;
    return fresh;
  } catch (e) {
    console.error('[Magic3DStudio] getDeviceUUID failed - using fallback id', e);
    return DEVICE_ID_FALLBACK;
  }
}

// ---- credit balance: pure helpers ----

const cleanCount = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fb);
type CreditBlock = 'daily' | 'total' | null;
/** Rule: check the daily credit first, then the total credit. Both must be above 0 for an action to run. */
const creditBlock = (c: Credits, cost = 1): CreditBlock => (c.daily < cost ? 'daily' : c.total < cost ? 'total' : null);
const hasCredit = (c: Credits, cost = 1) => creditBlock(c, cost) === null;
/** One action = 1 credit (an Advanced scene = 2): it comes off today's daily credits AND the total balance. */
const applySpend = (c: Credits, cost = 1): Credits => ({ ...c, daily: Math.max(0, c.daily - cost), total: Math.max(0, c.total - cost) });

/** Daily allowance renews on a new local day; the total balance never resets. */
const withDailyReset = (c: Credits): Credits => (c.day === todayKey() ? c : { ...c, daily: dailyOnNewDay(c.total), day: todayKey() });
const msUntilMidnight = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0, 0).getTime() - n.getTime();
};
const formatCountdown = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
};

async function saveCredits(c: Credits): Promise<void> {
  await Promise.all([kvSet('credit.daily', String(c.daily)), kvSet('credit.total', String(c.total)), kvSet('credit.day', c.day)]);
}

async function loadCachedCredits(): Promise<Credits | null> {
  const [d, t, day, lim] = await Promise.all([kvGet('credit.daily'), kvGet('credit.total'), kvGet('credit.day'), kvGet('credit.dailylimit')]);
  const daily = Number.parseInt(d ?? '', 10);
  const total = Number.parseInt(t ?? '', 10);
  if (Number.isNaN(daily) || Number.isNaN(total)) return null;
  const limit = Number.parseInt(lim ?? '', 10);
  if (!Number.isNaN(limit)) userDailyLimit = Math.max(0, limit); // the user's own allowance, mirrored from the backend
  const today = todayKey();
  // New local day: the daily allowance has renewed (the API confirms the real number on the next sync).
  const totalOk = Math.max(0, total);
  return { daily: day === today ? Math.max(0, daily) : dailyOnNewDay(totalOk), total: totalOk, day: today };
}

/**
 * Public: the daily and total credit for a device uuid (defaults to this device). Reads the credit API (source of truth),
 * falls back to the cached balance, applies the daily reset and mirrors the result into expo-sqlite.
 * The real fetch lives in realFetchCredits (TODO(production)).
 */
async function getDeviceCredits(deviceId?: string): Promise<{ daily: number; total: number }> {
  const id = deviceId ?? (await getDeviceUUID());
  const { credits } = await syncCredits(id);
  const fresh = withDailyReset(credits);
  if (fresh !== credits) await saveCredits(fresh);
  return { daily: fresh.daily, total: fresh.total };
}

// ---- credit API (mock server lives in sqlite so Expo Go behaves like a real backend) ----

async function mockFetchCredits(_deviceId: string): Promise<Credits> {
  await sleep(350);
  if (MOCK_CREDIT_API_OFFLINE) throw new Error('mock credit api offline');
  const today = todayKey();
  const [d, t, day] = await Promise.all([kvGet('mock.server.daily'), kvGet('mock.server.total'), kvGet('mock.server.day')]);
  let daily = Number.parseInt(d ?? '', 10);
  const total = Number.parseInt(t ?? '', 10);
  const totalOk = Number.isNaN(total) ? DEFAULT_CREDITS.total : total;
  if (Number.isNaN(daily) || day !== today) daily = dailyOnNewDay(totalOk);
  return { daily, total: totalOk, day: today };
}

async function mockWriteServerCredits(c: Credits): Promise<void> {
  await Promise.all([kvSet('mock.server.daily', String(c.daily)), kvSet('mock.server.total', String(c.total)), kvSet('mock.server.day', c.day)]);
}

/* ---- real credit backend: AWS Amplify (AppSync) ---------------------------------------------------------------
 * MagicStudioSettings = global settings (the default daily / total credit for a new user and for the daily reset).
 * UserSettings        = one row per device (key: deviceuuid) with dailycredit / totalcredit stored as STRINGS.
 * ASSUMPTIONS to confirm against your schema: updateUserSettings(input: { id, dailycredit, totalcredit, updateddate })
 * exists, and the global row exposes dailycredit / totalcredit. Set GRAPHQL_AUTH_MODE if your API is not on its default auth.
 */
const GRAPHQL_AUTH_MODE: undefined | 'apiKey' | 'iam' | 'userPool' | 'identityPool' = undefined;
let gqlClient: ReturnType<typeof generateClient> | null = null;
async function gql<T = any>(query: any, variables?: Record<string, unknown>): Promise<T> {
  if (!gqlClient) gqlClient = generateClient();
  const res: any = await gqlClient.graphql({ query, variables, ...(GRAPHQL_AUTH_MODE ? { authMode: GRAPHQL_AUTH_MODE } : null) } as any);
  if (res?.errors?.length) throw new Error(String(res.errors[0]?.message ?? 'GraphQL error'));
  return res.data as T;
}
const creditField = (v: unknown, fb: number) => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fb;
};

/** Global default credits (read once per app run); updates DEFAULT_CREDITS so the daily reset and new users use them. */
let globalCreditsLoaded = false;
async function readGlobalCredits(): Promise<{ daily: number; total: number }> {
  if (globalCreditsLoaded) return { daily: DEFAULT_CREDITS.daily, total: DEFAULT_CREDITS.total };
  try {
    const data = await gql<any>(listMagicStudioSettings, { limit: 1 });
    const row = data?.listMagicStudioSettings?.items?.find((x: any) => x) ?? null;
    if (row) {
      DEFAULT_CREDITS.daily = creditField(row.dailycredit, DEFAULT_CREDITS.daily);
      DEFAULT_CREDITS.total = creditField(row.totalcredit, DEFAULT_CREDITS.total);
      globalCreditsLoaded = true;
      console.log(`[Magic3DStudio] global credits from backend: daily ${DEFAULT_CREDITS.daily}, total ${DEFAULT_CREDITS.total}`);
    }
  } catch (e) {
    console.warn('[Magic3DStudio] could not read the global credits - using the built-in defaults', e);
  }
  return { daily: DEFAULT_CREDITS.daily, total: DEFAULT_CREDITS.total };
}

/**
 * The generated getUserSettings query is keyed by `id` (ID!), not by deviceuuid, so the row is found with a filtered list.
 * A filter runs AFTER each page is read, so the pages are followed until the row turns up.
 * TIP: add `@index(name: "byDeviceuuid", queryField: "userSettingsByDeviceuuid")` on deviceuuid for a fast lookup.
 */
const userRowIds = new Map<string, string>();
async function findUserRow(deviceId: string): Promise<any | null> {
  let nextToken: string | null | undefined = null;
  for (let page = 0; page < 30; page++) {
    const data: any = await gql(listUserSettings, { filter: { deviceuuid: { eq: deviceId } }, nextToken });
    const conn = data?.listUserSettings;
    const row = conn?.items?.find((x: any) => x && x.deviceuuid === deviceId);
    if (row) {
      if (row.id) userRowIds.set(deviceId, row.id);
      return row;
    }
    nextToken = conn?.nextToken;
    if (!nextToken) return null;
  }
  return null;
}

async function writeUserCredits(deviceId: string, c: { daily: number; total: number }): Promise<void> {
  let id = userRowIds.get(deviceId);
  if (!id) id = (await findUserRow(deviceId))?.id;
  if (!id) throw new Error('No UserSettings row for this device yet');
  await gql(updateUserSettings, {
    input: { id, dailycredit: String(c.daily), totalcredit: String(c.total), updateddate: new Date().toISOString() },
  });
}

/**
 * A purchase raises BOTH balances: daily = remaining daily + credits, total = remaining total + credits (written to the
 * backend and mirrored in expo-sqlite). `txId` makes it idempotent, so a retry never grants the same purchase twice.
 * The paid grant is first written to a pending list in expo-sqlite, so a crash / no network right after the payment never
 * loses it: it is sent to the backend as soon as possible (flushPendingGrants runs on every credit sync as well).
 * If you later grant credits from a RevenueCat webhook instead, stop calling this to avoid double credit.
 */
type PendingGrant = { txId: string; credits: number };
const CREDIT_GRANTS_KEY = 'credit.grants.pending';
async function readPendingGrants(): Promise<PendingGrant[]> {
  try {
    const raw = await kvGet(CREDIT_GRANTS_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((g) => g && typeof g.txId === 'string' && Number.isFinite(g.credits) && g.credits > 0) : [];
  } catch {
    return [];
  }
}
/** Sends every pending purchase grant to the backend (and mirrors it into expo-sqlite). Returns the new balance, or null if nothing was sent. */
async function flushPendingGrants(deviceId: string): Promise<Credits | null> {
  if (!shouldUseRealCredit()) return null;
  let list = await readPendingGrants();
  let last: Credits | null = null;
  for (const g of [...list]) {
    const doneKey = `credit.granted.${g.txId}`;
    try {
      if (!(await kvGet(doneKey))) {
        const cur = await realFetchCredits(deviceId); // also applies the new-day reset first
        const next: Credits = { daily: cur.daily + g.credits, total: cur.total + g.credits, day: todayKey() };
        await writeUserCredits(deviceId, next);
        await saveCredits(next);
        await kvSet(doneKey, '1');
        last = next;
        console.log(`[Magic3DStudio] purchase granted +${g.credits}: daily ${cur.daily}->${next.daily}, total ${cur.total}->${next.total}`);
      }
      list = list.filter((x) => x.txId !== g.txId);
      await kvSet(CREDIT_GRANTS_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[Magic3DStudio] purchase grant could not reach the backend yet - it stays pending', e);
      break;
    }
  }
  return last;
}
async function grantPurchasedCredits(deviceId: string, credits: number, txId: string): Promise<Credits> {
  const doneKey = `credit.granted.${txId}`;
  if (!(await kvGet(doneKey))) {
    const list = await readPendingGrants();
    if (!list.some((g) => g.txId === txId)) {
      list.push({ txId, credits });
      await kvSet(CREDIT_GRANTS_KEY, JSON.stringify(list)); // 1) the paid grant is safe on the device
    }
  }
  const sent = await flushPendingGrants(deviceId); // 2) backend + expo-sqlite
  if (sent) return sent;
  const cached = (await loadCachedCredits()) ?? { daily: 0, total: 0, day: todayKey() };
  if (await kvGet(doneKey)) return cached;
  // the backend could not be reached: show the credits right away from expo-sqlite; the pending grant reaches the backend later
  const local: Credits = { daily: cached.daily + credits, total: cached.total + credits, day: todayKey() };
  await saveCredits(local);
  return local;
}

async function realFetchCredits(deviceId: string): Promise<Credits> {
  const global = await readGlobalCredits();
  const row = await findUserRow(deviceId);
  if (!row) {
    // first launch of this device: create its row with the global default credits
    const now = new Date().toISOString();
    const created = await gql<any>(createUserSettings, {
      input: { deviceuuid: deviceId, dailycredit: String(global.daily), totalcredit: String(global.total), createddate: now, updateddate: now, email: '', enable: true, isadmin: false, phonenumber: '', deviceos: DEVICE_OS },
    });
    const newId = created?.createUserSettings?.id;
    if (newId) userRowIds.set(deviceId, newId);
    return { daily: global.daily, total: global.total, day: todayKey() };
  }
  // rows created before 'deviceos' existed get it once (best effort)
  if (row.id && !row.deviceos) gql(updateUserSettings, { input: { id: row.id, deviceos: DEVICE_OS } }).catch((e) => console.warn('[Magic3DStudio] could not set deviceos', e));
  if (row.enable === false) return { daily: 0, total: 0, day: todayKey() }; // account switched off in the backend
  let daily = creditField(row.dailycredit, 0);
  const total = creditField(row.totalcredit, 0);
  // Per-user daily allowance (optional `dailylimit` on UserSettings). Missing / empty = follow the global default.
  if ('dailylimit' in row && row.dailylimit !== null && row.dailylimit !== '') {
    userDailyLimit = creditField(row.dailylimit, DEFAULT_CREDITS.daily);
    kvSet('credit.dailylimit', String(userDailyLimit)).catch(() => undefined);
  } else {
    userDailyLimit = null;
    kvSet('credit.dailylimit', '').catch(() => undefined);
  }
  // Daily reset: the row was last written on an earlier local day, so today's allowance starts fresh.
  const last = row.updateddate ? new Date(row.updateddate) : null;
  const lastKey = last && !Number.isNaN(last.getTime()) ? `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}` : null;
  if (lastKey !== todayKey()) {
    daily = dailyOnNewDay(total);
    console.log(`[Magic3DStudio] new day: daily credit set to ${daily} (allowance ${dailyAllowance()}, total ${total})`);
    await writeUserCredits(deviceId, { daily, total }).catch((e) => console.warn('[Magic3DStudio] daily reset write failed (will retry next sync)', e));
  }
  return { daily, total, day: todayKey() };
}

async function mockReportCreditUsage(_deviceId: string, _action: CreditAction, after: Credits): Promise<void> {
  await mockWriteServerCredits(after);
}

/** Writes the balance after a spend (scene or harmonize image) to the user's row. */
async function realReportCreditUsage(deviceId: string, action: CreditAction, after: Credits): Promise<void> {
  console.log(`[Magic3DStudio] writing credit after ${action}: daily ${after.daily}, total ${after.total}`);
  await writeUserCredits(deviceId, after);
}

const CreditApi = {
  fetch: (id: string) => (shouldUseRealCredit() ? realFetchCredits(id) : mockFetchCredits(id)),
  report: (id: string, a: CreditAction, after: Credits) => (shouldUseRealCredit() ? realReportCreditUsage(id, a, after) : mockReportCreditUsage(id, a, after)),
};

/**
 * Reads the balance from the API (source of truth) and mirrors it into expo-sqlite.
 * If the API cannot be reached: last cached balance, else the default 2 daily / 2 total.
 */
async function syncCredits(deviceId: string): Promise<{ credits: Credits; source: CreditSource }> {
  try {
    await flushPendingCreditWrite(deviceId); // a spend that could not reach the backend earlier goes first
    await flushPendingGrants(deviceId); // so does a paid purchase that could not be saved yet
    const raw = await withTimeout(CreditApi.fetch(deviceId), CREDIT_API_TIMEOUT_MS);
    let credits: Credits = withDailyReset({ daily: cleanCount(raw.daily, 0), total: cleanCount(raw.total, 0), day: todayKey() });
    // still unsent (backend unreachable for the write)? never hand back credits the user already spent
    const pending = await readPendingCreditWrite();
    if (pending && pending.day === todayKey()) credits = { ...credits, daily: Math.min(credits.daily, pending.daily), total: Math.min(credits.total, pending.total) };
    await saveCredits(credits);
    console.log(`[Magic3DStudio] credits synced from the ${shouldUseRealCredit() ? 'backend' : 'mock server'} -> expo-sqlite: daily ${credits.daily}, total ${credits.total}`);
    return { credits, source: 'api' };
  } catch (e) {
    console.error('[Magic3DStudio] credit API unavailable - using fallback balance', e);
    const cached = await loadCachedCredits();
    if (cached) return { credits: cached, source: 'cache' };
    const fallback: Credits = { ...DEFAULT_CREDITS, day: todayKey() };
    await saveCredits(fallback);
    return { credits: fallback, source: 'default' };
  }
}

/** Called when an action is triggered: logs the new balance, saves it to expo-sqlite and reports it to the API. */
async function logCreditUsage(deviceId: string, action: CreditAction, before: Credits, after: Credits): Promise<void> {
  console.log(
    `[Magic3DStudio] credit used by ${action}: daily ${before.daily}->${after.daily}, total ${before.total}->${after.total} (device ${deviceId})`,
  );
  await saveCredits(after);
  try {
    const db = await openDb();
    await db?.runAsync(
      'INSERT INTO credit_log (ts, device_id, action, daily_after, total_after) VALUES (?, ?, ?, ?, ?)',
      Date.now(),
      deviceId,
      action,
      after.daily,
      after.total,
    );
  } catch (e) {
    console.error('[Magic3DStudio] credit log write failed', e);
  }
  console.log('[Magic3DStudio] credit saved to expo-sqlite');
  try {
    await CreditApi.report(deviceId, action, after);
    await kvSet(CREDIT_PENDING_KEY, ''); // this write supersedes any older unsent one
    console.log(`[Magic3DStudio] credit written to the ${shouldUseRealCredit() ? 'backend' : 'mock server'}`);
  } catch (e) {
    console.error('[Magic3DStudio] could not report credit usage to the API - kept to retry on the next sync', e);
    // keep the unsent balance so the next sync writes it before reading (otherwise the stale backend value would win)
    await kvSet(CREDIT_PENDING_KEY, JSON.stringify({ daily: after.daily, total: after.total, day: todayKey(), action })).catch(() => undefined);
  }
}

const CREDIT_PENDING_KEY = 'credit.pending';
async function readPendingCreditWrite(): Promise<{ daily: number; total: number; day: string } | null> {
  try {
    const raw = await kvGet(CREDIT_PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { daily: cleanCount(p.daily, 0), total: cleanCount(p.total, 0), day: String(p.day ?? '') };
  } catch {
    return null;
  }
}
/** Retries a spend that failed to reach the backend. Only meaningful for the real backend (the mock server is local). */
async function flushPendingCreditWrite(deviceId: string): Promise<void> {
  if (!shouldUseRealCredit()) return;
  const p = await readPendingCreditWrite();
  if (!p) return;
  try {
    await writeUserCredits(deviceId, { daily: p.daily, total: p.total });
    await kvSet(CREDIT_PENDING_KEY, '');
    console.log('[Magic3DStudio] sent the earlier unsent credit update to the backend');
  } catch (e) {
    console.warn('[Magic3DStudio] pending credit update still cannot be sent', e);
  }
}

// ---- RevenueCat (lazy: Expo Go / MOCK mode never touches the native module) ----

let purchasesCache: any | null | undefined;
function loadPurchases(): any | null {
  if (purchasesCache !== undefined) return purchasesCache;
  if (GLOBAL_MODE === 'MOCK') {
    purchasesCache = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-purchases');
    purchasesCache = mod?.default ?? mod;
  } catch (e) {
    console.warn('[Magic3DStudio] react-native-purchases is not installed.');
    purchasesCache = null;
  }
  return purchasesCache;
}

let purchasesConfigured = false;
async function ensurePurchases(deviceId: string): Promise<any> {
  const P = loadPurchases();
  if (!P) throw new Error('react-native-purchases is not installed');
  if (!purchasesConfigured) {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_CONFIG.iosApiKey : REVENUECAT_CONFIG.androidApiKey;
    if (!apiKey) throw new Error('RevenueCat API key is missing (see REVENUECAT_CONFIG)'); // TODO(production): add the key
    if (P.setLogLevel && P.LOG_LEVEL) P.setLogLevel(P.LOG_LEVEL.WARN);
    // The device id is the RevenueCat app user id, so the webhook can credit the same id the credit API uses.
    // Never share the 'guess' fallback id between users: let RevenueCat create an anonymous id instead.
    P.configure({ apiKey, appUserID: deviceId === DEVICE_ID_FALLBACK ? undefined : deviceId });
    purchasesConfigured = true;
  }
  return P;
}

async function mockLoadCreditPacks(): Promise<CreditPack[]> {
  await sleep(500);
  return MOCK_CREDIT_PACKS;
}

async function realLoadCreditPacks(deviceId: string): Promise<CreditPack[]> {
  const P = await ensurePurchases(deviceId);
  const offerings = await P.getOfferings();
  const offering = REVENUECAT_CONFIG.offeringId ? offerings.all?.[REVENUECAT_CONFIG.offeringId] : offerings.current;
  const packages: any[] = offering?.availablePackages ?? [];
  const packs = packages
    .map((pkg) => {
      const productId: string = pkg.product?.identifier ?? '';
      return {
        id: String(pkg.identifier),
        title: String(pkg.product?.title ?? productId).replace(/\s*\([^)]*\)\s*$/, ''), // Google appends "(App name)"
        unitPrice: Number(pkg.product?.price) > 0 && (REVENUECAT_CONFIG.creditsByProductId[productId] ?? 0) > 0 ? Number(pkg.product.price) / REVENUECAT_CONFIG.creditsByProductId[productId] : 0,
        credits: REVENUECAT_CONFIG.creditsByProductId[productId] ?? 0,
        priceLabel: String(pkg.product?.priceString ?? ''),
        native: pkg,
      } as CreditPack & { unitPrice: number };
    })
    .filter((x) => x.credits > 0)
    .sort((a, b) => a.credits - b.credits);
  if (packs.length === 0) throw new Error('No credit packs found in the RevenueCat offering');
  // BEST VALUE = the lowest price per credit (from the store's real prices)
  const priced = (packs as Array<CreditPack & { unitPrice?: number }>).filter((x) => (x.unitPrice ?? 0) > 0);
  if (priced.length >= 2) priced.reduce((a, b) => ((b.unitPrice ?? 0) < (a.unitPrice ?? 0) ? b : a)).badge = 'BEST VALUE';
  return packs;
}

async function mockPurchaseCreditPack(pack: CreditPack, deviceId: string): Promise<'purchased' | 'cancelled'> {
  await sleep(1400);
  if (shouldUseRealCredit()) {
    // test mode: update the real user record, exactly like production does after a purchase
    await grantPurchasedCredits(deviceId, pack.credits, `mock-${deviceId}-${Date.now()}`);
    return 'purchased';
  }
  // The real flow grants credits on the server (webhook). The mock server does it right here.
  const current = await mockFetchCredits(deviceId);
  // Mock server rule: a purchase raises both the total balance and today's allowance (the real webhook / API decides this).
  await mockWriteServerCredits({ ...current, daily: current.daily + pack.credits, total: current.total + pack.credits });
  return 'purchased';
}

async function realPurchaseCreditPack(pack: CreditPack, deviceId: string): Promise<'purchased' | 'cancelled'> {
  const P = await ensurePurchases(deviceId);
  let result: any;
  try {
    result = await P.purchasePackage(pack.native);
  } catch (e: any) {
    if (e?.userCancelled) return 'cancelled';
    throw e;
  }
  // Paid: add the pack's credits to this user's record (daily AND total). The transaction id keeps it idempotent.
  // TODO(production, optional): a RevenueCat webhook is the tamper-proof way to do this; if you add one, remove this call.
  const txId = String(result?.transaction?.transactionIdentifier ?? result?.customerInfo?.originalAppUserId ?? deviceId) + `-${pack.id}-${result?.transaction?.purchaseDate ?? Date.now()}`;
  await grantPurchasedCredits(deviceId, pack.credits, txId);
  return 'purchased';
}

async function mockRestorePurchases(): Promise<void> {
  await sleep(800);
}

async function realRestorePurchases(deviceId: string): Promise<void> {
  const P = await ensurePurchases(deviceId);
  await P.restorePurchases();
  // TODO(production): consumable credit packs are not restorable; this matters only if you add subscriptions.
}

const Purchasing = {
  packs: (id: string) => (isMockMode() ? mockLoadCreditPacks() : realLoadCreditPacks(id)),
  purchase: (pack: CreditPack, id: string) => (isMockMode() ? mockPurchaseCreditPack(pack, id) : realPurchaseCreditPack(pack, id)),
  restore: (id: string) => (isMockMode() ? mockRestorePurchases() : realRestorePurchases(id)),
};

/* ============================================================================
 * 6. SCENESPEC DEFAULTS + VALIDATION
 * ========================================================================== */

const DEFAULT_SCENE_SPEC: SceneSpec = {
  version: 1,
  mode: 'film',
  environment: {
    type: 'modern_living_room',
    table: { enabled: true, style: 'modern', height: 0 },
    floor: { enabled: true, type: 'wood', reflectivity: 0.25 },
  },
  product: { position: [0, 1.3, 0], rotation: [0, 0, 0], scale: 1 },
  animation: {
    type: 'float_rotate',
    duration: 8,
    rotation: { axis: 'y', speed: 0.35 },
    float: { amplitude: 0.08, frequency: 0.7 },
  },
  camera: { type: 'cinematic_orbit', duration: 8, distance: 3.5, height: 1.5, fov: 42 },
  lighting: { preset: 'soft_studio', keyIntensity: 3.5, rimIntensity: 2.5 },
  effects: { bloom: 0.15, fog: 0.04, depthOfField: 0.25, particles: false, vignette: true },
  cameraBackground: {},
  productEffects: { wind: 0, wave: 0, antiGravity: false },
  render: { duration: 8, fps: 30 },
};

const isRec = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const vNum = (v: unknown, fb: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fb;
const vBool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
const vOne = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fb;
const vStr = (v: unknown, fb: string) => (typeof v === 'string' && v.length < 40 ? v : fb);
const vVec3 = (v: unknown, fb: Vec3, lim: number): Vec3 =>
  Array.isArray(v) && v.length === 3 ? [vNum(v[0], fb[0], -lim, lim), vNum(v[1], fb[1], -lim, lim), vNum(v[2], fb[2], -lim, lim)] : fb;

/** The ONLY gate between planner output (mock or LLM) and the renderer. Whitelists + clamps everything. */
function validateSceneSpec(raw: unknown, caps: FilmStudioCapabilities = FILM_STUDIO_CAPABILITIES): SceneSpec {
  const r = isRec(raw) ? raw : {};
  const d = DEFAULT_SCENE_SPEC;
  const env = isRec(r.environment) ? r.environment : {};
  const table = isRec(env.table) ? env.table : {};
  const floor = isRec(env.floor) ? env.floor : {};
  const prod = isRec(r.product) ? r.product : {};
  const an = isRec(r.animation) ? r.animation : {};
  const anRot = isRec(an.rotation) ? an.rotation : {};
  const anFloat = isRec(an.float) ? an.float : {};
  const cam = isRec(r.camera) ? r.camera : {};
  const li = isRec(r.lighting) ? r.lighting : {};
  const fx = isRec(r.effects) ? r.effects : {};
  const cb = isRec(r.cameraBackground) ? r.cameraBackground : {};
  const pfx = isRec(r.productEffects) ? r.productEffects : {};
  const rd = isRec(r.render) ? r.render : {};

  return {
    version: 1,
    mode: vOne(r.mode, ['film', 'camera'] as const, d.mode),
    environment: {
      type: vOne(env.type, caps.environments, d.environment.type as string),
      table: {
        enabled: vBool(table.enabled, d.environment.table!.enabled),
        style: vStr(table.style, 'modern'),
        height: vNum(table.height, 0, -0.5, 1),
      },
      floor: {
        enabled: vBool(floor.enabled, true),
        type: vStr(floor.type, 'matte'),
        reflectivity: vNum(floor.reflectivity, 0.2, 0, 1),
      },
    },
    product: {
      position: vVec3(prod.position, d.product.position, 10),
      rotation: vVec3(prod.rotation, d.product.rotation, Math.PI * 2),
      scale: vNum(prod.scale, 1, 0.2, 3),
    },
    animation: {
      type: vOne(an.type, ['none', ...caps.animations], 'float_rotate'),
      duration: vNum(an.duration, 8, 1, 60),
      rotation: {
        axis: vOne(anRot.axis, ['x', 'y', 'z'] as const, 'y'),
        speed: vNum(anRot.speed, 0.35, -6, 6),
      },
      float: {
        amplitude: vNum(anFloat.amplitude, 0.08, 0, 1),
        frequency: vNum(anFloat.frequency, 0.7, 0, 6),
      },
    },
    camera: {
      type: vOne(cam.type, caps.cameraTypes, 'cinematic_orbit'),
      duration: vNum(cam.duration, 8, 1, 60),
      distance: vNum(cam.distance, 3.5, 1.2, 12),
      height: vNum(cam.height, 1.5, -2, 8),
      fov: vNum(cam.fov, 42, 20, 90),
    },
    lighting: {
      preset: vOne(li.preset, caps.lightingPresets, 'soft_studio'),
      keyIntensity: vNum(li.keyIntensity, 3.5, 0, 12),
      rimIntensity: vNum(li.rimIntensity, 2.5, 0, 12),
    },
    effects: {
      bloom: vNum(fx.bloom, 0.15, 0, 1),
      fog: vNum(fx.fog, 0.04, 0, 0.3),
      depthOfField: vNum(fx.depthOfField, 0.25, 0, 1),
      particles: vBool(fx.particles, false),
      vignette: vBool(fx.vignette, true),
    },
    cameraBackground: {
      invert: vBool(cb.invert, false),
      grayscale: vBool(cb.grayscale, false),
      blur: vNum(cb.blur, 0, 0, 1),
      sepia: vBool(cb.sepia, false),
      pencil: vBool(cb.pencil, false),
      neon: vBool(cb.neon, false),
    },
    productEffects: {
      wind: vNum(pfx.wind, 0, 0, 1),
      wave: vNum(pfx.wave, 0, 0, 1),
      antiGravity: vBool(pfx.antiGravity, false),
      motions: Array.isArray(pfx.motions) ? (pfx.motions as unknown[]).filter((m): m is string => typeof m === 'string' && MOTION_IDS.includes(m)).slice(0, 60) : [],
    },
    render: { duration: vNum(rd.duration, 8, 1, 120), fps: vOne(String(rd.fps), ['24', '30', '60'] as const, '30') === '24' ? 24 : String(rd.fps) === '60' ? 60 : 30 },
  };
}

/** Switching tabs adjusts mode-specific defaults but never executes anything. */
function applyMode(scene: SceneSpec, mode: 'film' | 'camera'): SceneSpec {
  const s = { ...scene, mode };
  if (mode === 'camera') {
    const pe = scene.productEffects ?? { wind: 0, wave: 0, antiGravity: false };
    if (!pe.antiGravity && pe.wind === 0 && pe.wave === 0) s.productEffects = { wind: 0.2, wave: 0.25, antiGravity: true };
  }
  return s;
}

/* ============================================================================
 * 8. 3D BUILDING BLOCKS
 * ========================================================================== */

// ---- 8.1 textures --------------------------------------------------------------

const PROC_CACHE = new Map<string, THREE.DataTexture>();

function makeProcTexture(
  w: number,
  h: number,
  fn: (x: number, y: number, o: number[]) => void,
  opts: { srgb?: boolean; repeat?: boolean } = {},
): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  const o = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      o[3] = 255;
      fn(x, y, o);
      const i = (y * w + x) * 4;
      data[i] = o[0];
      data[i + 1] = o[1];
      data[i + 2] = o[2];
      data[i + 3] = o[3];
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const PROC_BUILDERS: Record<string, () => THREE.DataTexture> = {
  wood: () =>
    makeProcTexture(128, 128, (x, y, o) => {
      const plank = Math.floor(x / 16);
      const base = 0.62 + hash2(plank, 1) * 0.22;
      const grain = 0.92 + 0.08 * Math.sin(y * 0.4 + plank * 3.1 + hash2(x, y) * 0.6);
      const seam = x % 16 === 0 ? 0.55 : 1;
      const k = base * grain * seam;
      o[0] = 196 * k;
      o[1] = 142 * k;
      o[2] = 96 * k;
    }, { repeat: true }),
  marble: () =>
    makeProcTexture(128, 128, (x, y, o) => {
      const v = Math.sin((x + 9 * Math.sin(y * 0.07 + 1.3)) * 0.09) * 0.5 + 0.5;
      const vein = smoothstep(0.82, 1, v) * 0.5 + hash2(x >> 1, y >> 1) * 0.04;
      const k = 1 - vein;
      o[0] = 245 * k;
      o[1] = 241 * k;
      o[2] = 236 * k;
    }, { repeat: true }),
  grid: () =>
    makeProcTexture(128, 128, (x, y, o) => {
      const line = x % 32 < 2 || y % 32 < 2;
      o[0] = line ? 20 : 8;
      o[1] = line ? 230 : 8;
      o[2] = line ? 255 : 20;
    }, { repeat: true }),
  window: () =>
    makeProcTexture(128, 64, (x, y, o) => {
      const v = y / 63; // 0 = horizon (bottom), 1 = sky
      const band = Math.floor(x / 8);
      const bh = 8 + hash2(band, 3) * 26;
      if (y < bh) {
        const lit = x % 8 > 2 && y % 6 > 2 && hash2(x, y) > 0.62;
        o[0] = lit ? 255 : 58;
        o[1] = lit ? 214 : 66;
        o[2] = lit ? 150 : 92;
      } else {
        const t = Math.pow(v, 0.8);
        o[0] = lerp(255, 120, t);
        o[1] = lerp(176, 140, t);
        o[2] = lerp(118, 205, t);
      }
    }),
  radial: () =>
    makeProcTexture(64, 64, (x, y, o) => {
      const r = Math.hypot((x - 31.5) / 32, (y - 31.5) / 32);
      const a = Math.pow(clamp(1 - r, 0, 1), 2);
      o[0] = o[1] = o[2] = 255;
      o[3] = a * 255;
    }),
  disc: () =>
    makeProcTexture(64, 64, (x, y, o) => {
      const r = Math.hypot((x - 31.5) / 32, (y - 31.5) / 32);
      o[0] = o[1] = o[2] = 255;
      o[3] = (1 - smoothstep(0.72, 0.98, r)) * 255;
    }),
};
function getProcTexture(key: string): THREE.DataTexture {
  let t = PROC_CACHE.get(key);
  if (!t) {
    t = PROC_BUILDERS[key]();
    PROC_CACHE.set(key, t);
  }
  return t;
}

/** Product texture from the Skia pixel cache (rows flipped for GL; no loader needed). */
function useSkiaTexture(uri: string | undefined, srgb: boolean): THREE.DataTexture | null {
  const tex = useMemo(() => {
    if (!uri) return null;
    const img = IMAGE_CACHE.get(uri);
    if (!img) return null;
    const w = img.width();
    const h = img.height();
    const px = img.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }) as Uint8Array | null;
    if (!px) return null;
    const flipped = new Uint8Array(px.length);
    const row = w * 4;
    for (let y = 0; y < h; y++) flipped.set(px.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
    const t = new THREE.DataTexture(flipped, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }, [uri, srgb]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

// ---- 8.2 lighting presets (data-driven) ------------------------------------------

type LightingDef = {
  ambient: [string, number];
  hemi: [string, string, number];
  key: { color: string; pos: Vec3 };
  rim: { color: string; pos: Vec3 };
  fill?: { color: string; pos: Vec3; i: number };
  exposure: number;
};

const LIGHTING_REGISTRY: Record<string, LightingDef> = {
  soft_studio: {
    ambient: ['#ffffff', 0.55],
    hemi: ['#fff4e8', '#b8c4d8', 0.6],
    key: { color: '#fff1e0', pos: [3, 5, 4] },
    rim: { color: '#cfe3ff', pos: [-4, 3, -3] },
    fill: { color: '#ffe9d6', pos: [-3, 1.5, 3], i: 0.8 },
    exposure: 1.05,
  },
  dramatic: {
    ambient: ['#7788aa', 0.18],
    hemi: ['#445577', '#0a0a10', 0.3],
    key: { color: '#ffd9b0', pos: [4, 4, 2] },
    rim: { color: '#7aa2ff', pos: [-4, 2.5, -3] },
    exposure: 1.1,
  },
  luxury: {
    ambient: ['#ffe9c0', 0.25],
    hemi: ['#ffe2a8', '#100c06', 0.35],
    key: { color: '#ffe2a8', pos: [2.5, 5, 3.5] },
    rim: { color: '#ffd58a', pos: [-3.5, 3, -3] },
    fill: { color: '#c9a45c', pos: [0, 0.6, 3], i: 0.5 },
    exposure: 1.15,
  },
  neon: {
    ambient: ['#6a3dff', 0.25],
    hemi: ['#ff3df2', '#00131f', 0.35],
    key: { color: '#ff3df2', pos: [3, 3.5, 3.5] },
    rim: { color: '#28e8ff', pos: [-4, 3, -2.5] },
    fill: { color: '#7a3dff', pos: [0, 0.4, 3], i: 0.7 },
    exposure: 1.2,
  },
};

const LightingRig = memo(function LightingRig({ scene }: { scene: SceneSpec }) {
  const def = LIGHTING_REGISTRY[scene.lighting.preset] ?? LIGHTING_REGISTRY.soft_studio;
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = def.exposure;
  }, [gl, def.exposure]);
  return (
    <>
      <ambientLight color={def.ambient[0]} intensity={def.ambient[1]} />
      <hemisphereLight args={[def.hemi[0], def.hemi[1], def.hemi[2]]} />
      <directionalLight color={def.key.color} position={def.key.pos} intensity={scene.lighting.keyIntensity * 0.55} />
      <directionalLight color={def.rim.color} position={def.rim.pos} intensity={scene.lighting.rimIntensity * 0.6} />
      {def.fill && <directionalLight color={def.fill.color} position={def.fill.pos} intensity={def.fill.i} />}
    </>
  );
});

// ---- 8.3 environments (registry: add hundreds by adding entries) -------------------

type Mat = {
  p?: Vec3;
  s: Vec3;
  c: string;
  r?: number;
  m?: number;
  e?: string;
  ei?: number;
  rot?: Vec3;
};
const Box = memo(function Box({ p = [0, 0, 0], s, c, r = 0.8, m = 0, e, ei = 1, rot }: Mat) {
  return (
    <mesh position={p} rotation={rot}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={r} metalness={m} emissive={e ?? '#000000'} emissiveIntensity={e ? ei : 0} />
    </mesh>
  );
});

type EnvDef = {
  label: string;
  background: string;
  fogColor: string;
  surfaceY: (s: SceneSpec) => number;
  Component: React.ComponentType<{ scene: SceneSpec }>;
};

const Table = memo(function Table({ topY, marble }: { topY: number; marble: boolean }) {
  const tex = marble ? getProcTexture('marble') : null;
  return (
    <group>
      <mesh position={[0, topY - 0.03, 0]}>
        <cylinderGeometry args={[1.1, 1.1, 0.06, 48]} />
        <meshStandardMaterial map={tex} color={marble ? '#ffffff' : '#3a3a40'} roughness={0.25} metalness={0.1} />
      </mesh>
      <mesh position={[0, topY / 2 - 0.03, 0]}>
        <cylinderGeometry args={[0.12, 0.16, topY - 0.06, 24]} />
        <meshStandardMaterial color="#b8924a" roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.55, 0.6, 0.06, 36]} />
        <meshStandardMaterial color="#b8924a" roughness={0.3} metalness={0.9} />
      </mesh>
    </group>
  );
});

const LivingRoom = memo(function LivingRoom({ scene }: { scene: SceneSpec }) {
  const wood = getProcTexture('wood').clone();
  wood.repeat.set(6, 6);
  wood.needsUpdate = true;
  const win = getProcTexture('window');
  const tableOn = scene.environment.table?.enabled;
  const topY = 0.55 + (scene.environment.table?.height ?? 0);
  const refl = scene.environment.floor?.reflectivity ?? 0.25;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial map={wood} roughness={clamp(0.9 - refl, 0.1, 1)} metalness={0.05} />
      </mesh>
      <Box p={[0, 3, -4]} s={[14, 6, 0.1]} c="#e9e1d6" r={0.95} />
      <mesh position={[2.6, 2.3, -3.93]}>
        <planeGeometry args={[4.6, 2.6]} />
        <meshBasicMaterial map={win} toneMapped={false} />
      </mesh>
      <Box p={[2.6, 2.3, -3.9]} s={[4.8, 0.08, 0.08]} c="#2a2a2e" />
      <Box p={[2.6, 3.62, -3.9]} s={[4.8, 0.08, 0.08]} c="#2a2a2e" />
      <Box p={[2.6, 0.98, -3.9]} s={[4.8, 0.08, 0.08]} c="#2a2a2e" />
      <Box p={[0.3, 2.3, -3.9]} s={[0.08, 2.7, 0.08]} c="#2a2a2e" />
      <Box p={[4.9, 2.3, -3.9]} s={[0.08, 2.7, 0.08]} c="#2a2a2e" />
      {/* sofa */}
      <group position={[-3, 0, -2.6]}>
        <Box p={[0, 0.3, 0]} s={[2.6, 0.5, 1.1]} c="#c9b8a6" r={0.95} />
        <Box p={[0, 0.78, -0.42]} s={[2.6, 0.7, 0.28]} c="#bfae9b" r={0.95} />
        <Box p={[-1.38, 0.5, 0]} s={[0.22, 0.8, 1.1]} c="#b9a792" r={0.95} />
        <Box p={[1.38, 0.5, 0]} s={[0.22, 0.8, 1.1]} c="#b9a792" r={0.95} />
        <Box p={[-0.6, 0.72, 0.05]} s={[0.5, 0.45, 0.14]} c="#5b7fa6" r={0.9} rot={[-0.2, 0.3, 0.1]} />
        <Box p={[0.7, 0.68, 0.08]} s={[0.46, 0.4, 0.14]} c="#d8cbb8" r={0.9} rot={[-0.15, -0.25, 0]} />
      </group>
      {/* plant */}
      <group position={[3.8, 0, -2.4]}>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.28, 0.2, 0.6, 20]} />
          <meshStandardMaterial color="#d9d2c8" roughness={0.9} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[Math.sin(i * 1.7) * 0.22, 0.9 + (i % 3) * 0.28, Math.cos(i * 1.7) * 0.2]}>
            <sphereGeometry args={[0.3 - i * 0.02, 14, 12]} />
            <meshStandardMaterial color={i % 2 ? '#4f8a52' : '#3f7a47'} roughness={0.85} />
          </mesh>
        ))}
      </group>
      {/* lamp */}
      <group position={[-5.4, 0, -2.2]}>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.6, 10]} />
          <meshStandardMaterial color="#222" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, 1.75, 0]}>
          <cylinderGeometry args={[0.2, 0.3, 0.4, 20]} />
          <meshStandardMaterial color="#ffe3b8" emissive="#ffc880" emissiveIntensity={1.2} />
        </mesh>
        <pointLight position={[0, 1.7, 0.3]} color="#ffb56b" intensity={9} distance={9} decay={1.6} />
      </group>
      <pointLight position={[3, 2.5, -2]} color="#ffbf80" intensity={8} distance={10} decay={1.6} />
      {tableOn && <Table topY={topY} marble />}
    </group>
  );
});

const StudioEnv = memo(function StudioEnv({ scene }: { scene: SceneSpec }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#e6eaf1" roughness={0.75} />
      </mesh>
      <Box p={[0, 3.5, -5]} s={[18, 8, 0.1]} c="#dfe5ee" r={1} />
      <Box p={[-3.5, 2.8, 1.5]} s={[0.1, 2.4, 1.6]} c="#ffffff" e="#ffffff" ei={1.4} rot={[0, 0.6, 0]} />
      <Box p={[3.5, 2.8, 1.5]} s={[0.1, 2.4, 1.6]} c="#ffffff" e="#ffffff" ei={1.4} rot={[0, -0.6, 0]} />
      {scene.environment.table?.enabled && <Table topY={0.55} marble={false} />}
    </group>
  );
});

const MinimalEnv = memo(function MinimalEnv({ scene }: { scene: SceneSpec }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[10, 48]} />
        <meshStandardMaterial color="#eceff4" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.2, 1.26, 64]} />
        <meshBasicMaterial color="#c7cedb" />
      </mesh>
      {scene.environment.table?.enabled && <Table topY={0.55} marble={false} />}
    </group>
  );
});

const LuxuryEnv = memo(function LuxuryEnv({ scene }: { scene: SceneSpec }) {
  const refl = scene.environment.floor?.reflectivity ?? 0.6;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[10, 64]} />
        <meshStandardMaterial color="#0b0b0f" roughness={clamp(0.5 - refl * 0.4, 0.08, 0.6)} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[1.0, 1.1, 0.56, 48]} />
        <meshStandardMaterial color="#0f0f14" roughness={0.12} metalness={0.95} />
      </mesh>
      <mesh position={[0, 0.575, 0]}>
        <cylinderGeometry args={[1.04, 1.04, 0.03, 48]} />
        <meshStandardMaterial color="#d6a84a" roughness={0.25} metalness={1} emissive="#8a5e12" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.2, 0.025, 12, 96]} />
        <meshStandardMaterial color="#d6a84a" metalness={1} roughness={0.2} emissive="#d6a84a" emissiveIntensity={0.6} />
      </mesh>
      <spotLight position={[0, 6, 1]} angle={0.45} penumbra={0.8} intensity={60} color="#ffe2a8" distance={14} decay={2} />
    </group>
  );
});

const CyberpunkEnv = memo(function CyberpunkEnv() {
  const grid = getProcTexture('grid').clone();
  grid.repeat.set(10, 10);
  grid.needsUpdate = true;
  const towers = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({ x: -8 + i * 1.25, h: 2 + hash2(i, 7) * 5, c: i % 2 ? '#ff3df2' : '#28e8ff' })),
    [],
  );
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial map={grid} roughness={0.35} metalness={0.6} emissive="#102a40" emissiveIntensity={0.8} />
      </mesh>
      {towers.map((t, i) => (
        <group key={i} position={[t.x, t.h / 2, -6 - (i % 3) * 0.8]}>
          <Box s={[0.9, t.h, 0.9]} c="#0b0b18" r={0.6} />
          <Box p={[0, t.h * 0.2, 0.46]} s={[0.7, 0.05, 0.02]} c={t.c} e={t.c} ei={2.2} />
          <Box p={[0, t.h * 0.05, 0.46]} s={[0.5, 0.05, 0.02]} c={t.c} e={t.c} ei={2.2} />
        </group>
      ))}
      <Box p={[-2.4, 1.6, -2.2]} s={[0.06, 3.2, 0.06]} c="#ff3df2" e="#ff3df2" ei={3} />
      <Box p={[2.4, 1.6, -2.2]} s={[0.06, 3.2, 0.06]} c="#28e8ff" e="#28e8ff" ei={3} />
      <Box p={[0, 3.2, -2.2]} s={[4.9, 0.06, 0.06]} c="#7a3dff" e="#7a3dff" ei={3} />
      <pointLight position={[-2.4, 1.6, -1.5]} color="#ff3df2" intensity={14} distance={9} decay={1.8} />
      <pointLight position={[2.4, 1.6, -1.5]} color="#28e8ff" intensity={14} distance={9} decay={1.8} />
    </group>
  );
});

const ENVIRONMENT_REGISTRY: Record<string, EnvDef> = {
  modern_living_room: {
    label: 'Modern living room',
    background: '#d9c7b3',
    fogColor: '#e8d5bf',
    surfaceY: (s) => (s.environment.table?.enabled ? 0.55 + (s.environment.table.height ?? 0) : 0),
    Component: LivingRoom,
  },
  studio: {
    label: 'Studio',
    background: '#dfe5ee',
    fogColor: '#e6ebf3',
    surfaceY: (s) => (s.environment.table?.enabled ? 0.55 : 0),
    Component: StudioEnv,
  },
  minimal: {
    label: 'Minimal',
    background: '#eceff4',
    fogColor: '#eceff4',
    surfaceY: (s) => (s.environment.table?.enabled ? 0.55 : 0),
    Component: MinimalEnv,
  },
  luxury: { label: 'Luxury', background: '#050507', fogColor: '#0a0806', surfaceY: () => 0.59, Component: LuxuryEnv },
  cyberpunk: { label: 'Cyberpunk', background: '#05040d', fogColor: '#120a24', surfaceY: () => 0, Component: CyberpunkEnv },
};
const getEnv = (s: SceneSpec): EnvDef => ENVIRONMENT_REGISTRY[s.environment.type] ?? ENVIRONMENT_REGISTRY.studio;

// ---- 8.4 product model (multi-view + depth-displaced planes) -----------------------

const PRODUCT_W = 1.7;
const SIDE_W = 1.0;
const DISPLACE = 0.3;

type CardDef = { label: ViewLabel; pos: Vec3; rotY: number; displaced: boolean; width: number };
const CARD_DEFS: CardDef[] = [
  { label: 'front', pos: [0, 0, 0.03], rotY: 0, displaced: true, width: PRODUCT_W },
  { label: 'back', pos: [0, 0, -0.03], rotY: Math.PI, displaced: true, width: PRODUCT_W },
  { label: 'left', pos: [-0.04, 0, 0], rotY: -Math.PI / 2, displaced: false, width: SIDE_W },
  { label: 'right', pos: [0.04, 0, 0], rotY: Math.PI / 2, displaced: false, width: SIDE_W },
];

/**
 * The 4 generated views become 4 cards. Front/back are tessellated planes displaced by their depth maps
 * (+ bump for relief shading). Left/right are side cards. Card opacity follows the camera angle so the
 * views blend as the product rotates. Replace mock views with real ones and nothing here changes.
 */
const ProductModel = memo(function ProductModel({ asset, only }: { asset: ProductAsset; only?: ViewLabel }) {
  const root = useRef<THREE.Group>(null);
  const cards = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const camera = useThree((s) => s.camera);
  const H = PRODUCT_W / Math.max(0.2, asset.metadata.aspectRatio);

  const tFront = useSkiaTexture(asset.views.front.imageUri, true);
  const tBack = useSkiaTexture(asset.views.back.imageUri, true);
  const tLeft = useSkiaTexture(asset.views.left.imageUri, true);
  const tRight = useSkiaTexture(asset.views.right.imageUri, true);
  const dFront = useSkiaTexture(asset.views.front.depthUri, false);
  const dBack = useSkiaTexture(asset.views.back.depthUri, false);
  const colorMaps = [tFront, tBack, tLeft, tRight];
  const depthMaps = [dFront, dBack, null, null];

  const tmp = useMemo(
    () => ({ cam: new THREE.Vector3(), center: new THREE.Vector3(), toCam: new THREE.Vector3(), n: new THREE.Vector3(), q: new THREE.Quaternion() }),
    [],
  );

  // Camera Studio: exactly ONE image, flat to the lens, never blended with the other views.
  const single = only ? CARD_DEFS.findIndex((d) => d.label === only) : -1;

  useFrame(() => {
    const g = root.current;
    if (!g) return;
    if (single >= 0) {
      for (let i = 0; i < CARD_DEFS.length; i++) {
        const card = cards.current[i];
        const mat = mats.current[i];
        if (!card || !mat) continue;
        card.visible = i === single;
        mat.opacity = 1;
      }
      return;
    }
    camera.getWorldPosition(tmp.cam);
    g.getWorldPosition(tmp.center);
    tmp.toCam.copy(tmp.cam).sub(tmp.center).normalize();
    for (let i = 0; i < CARD_DEFS.length; i++) {
      const card = cards.current[i];
      const mat = mats.current[i];
      if (!card || !mat) continue;
      card.getWorldQuaternion(tmp.q);
      tmp.n.set(0, 0, 1).applyQuaternion(tmp.q);
      const o = smoothstep(0.25, 0.85, tmp.n.dot(tmp.toCam));
      mat.opacity = o;
      card.visible = o > 0.01;
    }
  });

  return (
    <group ref={root}>
      {CARD_DEFS.map((d, i) => (
        <mesh
          key={`${d.label}-${single >= 0 ? 'one' : 'all'}`}
          ref={(m) => {
            cards.current[i] = m;
          }}
          position={single >= 0 ? [0, 0, 0] : d.pos}
          rotation={[0, single >= 0 ? 0 : d.rotY, 0]}
          visible={single < 0 || i === single}
        >
          <planeGeometry args={d.displaced ? [single >= 0 ? PRODUCT_W : d.width, H, 72, 54] : [single >= 0 ? PRODUCT_W : d.width, H, 1, 1]} />
          <meshStandardMaterial
            ref={(m) => {
              mats.current[i] = m;
            }}
            map={colorMaps[i] ?? undefined}
            displacementMap={depthMaps[i] ?? undefined}
            displacementScale={d.displaced ? (single >= 0 ? DISPLACE * 0.5 : DISPLACE) : 0}
            bumpMap={depthMaps[i] ?? undefined}
            bumpScale={d.displaced ? 1.5 : 0}
            transparent
            alphaTest={0.04}
            roughness={0.55}
            metalness={0.08}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
});

/** Cheap fake contact shadow (no shadow maps). */
const ContactShadow = memo(function ContactShadow({
  target,
  surfaceY,
  size,
}: {
  target: React.RefObject<THREE.Group>;
  surfaceY: number;
  size: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const t = target.current;
    const m = mesh.current;
    if (!t || !m || !mat.current) return;
    const h = Math.max(0, t.position.y - surfaceY);
    const s = size * (1 + h * 0.35);
    m.position.set(t.position.x, surfaceY + 0.004, t.position.z);
    m.scale.set(s, s, 1);
    mat.current.opacity = 0.55 / (1 + h * 1.3);
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={mat} map={getProcTexture('radial')} color="#000000" transparent depthWrite={false} />
    </mesh>
  );
});

/* ============================================================================
 * 9. ANIMATION ENGINE + CAMERA RIG REGISTRY
 * ========================================================================== */

type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number };
type SimClock = React.MutableRefObject<{ t: number }>;

const rotateBy = (t: number, s: SceneSpec, p: Pose) => {
  const r = s.animation.rotation;
  if (!r) return;
  const v = r.speed * t; // == rotation += speed * delta, integrated (and pause-safe)
  if (r.axis === 'x') p.rx += v;
  else if (r.axis === 'y') p.ry += v;
  else p.rz += v;
};
const floatBy = (t: number, s: SceneSpec, p: Pose) => {
  const f = s.animation.float ?? { amplitude: 0.08, frequency: 0.7 };
  const w = t * f.frequency * Math.PI; // y = baseY + sin(time * frequency) * amplitude
  p.y += Math.sin(w) * f.amplitude;
  p.rz += Math.sin(w * 0.7) * 0.02;
};
const bounceBy = (t: number, s: SceneSpec, p: Pose) => {
  const f = s.animation.float ?? { amplitude: 0.08, frequency: 0.7 };
  const amp = f.amplitude * 4 + 0.1;
  const ph = Math.abs(Math.sin(t * f.frequency * Math.PI * 1.5));
  p.y += ph * amp;
  p.sy *= 1 - 0.08 * Math.pow(1 - ph, 6);
  p.sx *= 1 + 0.04 * Math.pow(1 - ph, 6);
};

type AnimationFn = (t: number, s: SceneSpec, p: Pose) => void;
const ANIMATION_REGISTRY: Record<string, AnimationFn> = {
  none: () => {},
  rotate: rotateBy,
  float: floatBy,
  bounce: (t, s, p) => {
    bounceBy(t, s, p);
    rotateBy(t, s, p);
  },
  float_rotate: (t, s, p) => {
    floatBy(t, s, p);
    rotateBy(t, s, p);
  },
};

/** Product-level effect modifiers (Camera Studio extras). Add hundreds of entries here. */
type PoseModifier = { id: string; isActive: (s: SceneSpec) => boolean; apply: (t: number, s: SceneSpec, p: Pose) => void };
const POSE_MODIFIERS: PoseModifier[] = [
  {
    id: 'anti_gravity',
    isActive: (s) => !!s.productEffects?.antiGravity,
    apply: (t, _s, p) => {
      const period = 2.6;
      const ph = (t % period) / period;
      p.y += 4 * ph * (1 - ph) * 0.85; // parabolic hang-time jump
      const land = Math.max(0, 1 - ph * 9);
      p.sy *= 1 - 0.14 * land;
      p.sx *= 1 + 0.08 * land;
      p.rz += Math.sin(t * 1.3) * 0.22;
      p.rx += Math.sin(t * 0.9) * 0.12;
    },
  },
  {
    id: 'wave',
    isActive: (s) => (s.productEffects?.wave ?? 0) > 0,
    apply: (t, s, p) => {
      const k = s.productEffects!.wave;
      p.rz += Math.sin(t * 3.2) * 0.12 * k;
      p.y += Math.sin(t * 2.1 + 1) * 0.05 * k;
    },
  },
  {
    id: 'wind',
    isActive: (s) => (s.productEffects?.wind ?? 0) > 0,
    apply: (t, s, p) => {
      const k = s.productEffects!.wind;
      const gust = Math.sin(t * 0.8) * 0.5 + Math.sin(t * 2.3 + 2) * 0.3 + 0.3;
      p.x += gust * 0.18 * k;
      p.rz -= gust * 0.2 * k;
      p.ry += Math.sin(t * 1.7) * 0.1 * k;
    },
  },
];

/**
 * 50 extra motion presets (Camera Studio "Product motion"). Each is a pure function of time that nudges the pose, so they
 * stack with each other and with Anti-gravity / Wind / Wave. Add more by adding a row here - the UI lists this registry.
 */
type MotionDef = { id: string; label: string; icon: IconName; apply: (t: number, p: Pose) => void };
const smooth01 = (x: number) => x * x * (3 - 2 * x);
const MOTION_EFFECTS: MotionDef[] = [
  {
    id: 'pendulum',
    label: 'Pendulum',
    icon: 'swap-horizontal-outline',
    apply: (t, p) => {
      const a = Math.sin(t * 1.7) * 0.38;
      p.rz += a;
      p.x += Math.sin(t * 1.7) * 0.22; // swings from a pivot above the product
      p.y += (1 - Math.cos(a)) * 0.35;
    },
  },
  {
    id: 'heartbeat',
    label: 'Heartbeat',
    icon: 'heart-outline',
    apply: (t, p) => {
      const ph = (t % 1.15) / 1.15; // lub-dub
      const beat = Math.exp(-Math.pow((ph - 0.1) * 11, 2)) + 0.65 * Math.exp(-Math.pow((ph - 0.32) * 11, 2));
      const k = 1 + 0.11 * beat;
      p.sx *= k;
      p.sy *= k;
    },
  },
  {
    id: 'flip',
    label: 'Flip',
    icon: 'sync-outline',
    apply: (t, p) => {
      const period = 5;
      const ph = (t % period) / period;
      const flip = ph < 0.35 ? smooth01(ph / 0.35) : 1; // a quick full turn, then a calm hold
      p.ry += flip * Math.PI * 2;
      p.y += Math.sin(flip * Math.PI) * 0.12;
    },
  },
  {
    id: 'hover_tilt',
    label: 'Hover tilt',
    icon: 'layers-outline',
    apply: (t, p) => {
      p.ry += Math.sin(t * 0.9) * 0.38;
      p.rx += Math.cos(t * 0.7) * 0.2;
      p.y += Math.sin(t * 1.4) * 0.09;
    },
  },
  {
    id: 'pop',
    label: 'Pop jump',
    icon: 'arrow-up-circle-outline',
    apply: (t, p) => {
      const period = 1.5;
      const ph = (t % period) / period;
      const air = Math.sin(Math.min(1, ph / 0.8) * Math.PI); // 0 on the ground, 1 at the top
      p.y += air * 0.75;
      const squash = ph > 0.8 ? Math.sin(((ph - 0.8) / 0.2) * Math.PI) : 0; // lands and squashes
      p.sy *= 1 - 0.18 * squash + 0.06 * air;
      p.sx *= 1 + 0.12 * squash - 0.03 * air;
    },
  },
  {
    id: 'shake',
    label: 'Shake',
    icon: 'phone-portrait-outline',
    apply: (t, p) => {
      const burst = Math.max(0, Math.sin(((t % 2.6) / 2.6) * Math.PI * 2 - 0.4)); // shakes in bursts, rests between
      const k = burst * burst;
      p.x += Math.sin(t * 46) * 0.035 * k;
      p.rz += Math.sin(t * 38 + 1) * 0.09 * k;
    },
  },
  {
    id: 'figure8',
    label: 'Figure-8',
    icon: 'infinite-outline',
    apply: (t, p) => {
      p.x += Math.sin(t * 0.9) * 0.36;
      p.y += Math.sin(t * 1.8) * 0.16;
      p.rz += Math.cos(t * 0.9) * 0.1;
    },
  },
  // ---- 20 more effects ----
  { id: 'orbit', label: 'Orbit', icon: 'planet-outline', apply: (t, p) => {
      p.x += Math.cos(t * 1.1) * 0.3;
      p.z += Math.sin(t * 1.1) * 0.3;
      p.ry += Math.sin(t * 1.1) * 0.25;
  } },
  { id: 'levitate_spin', label: 'Levitate spin', icon: 'refresh-circle-outline', apply: (t, p) => {
      p.y += 0.18 + Math.sin(t * 1.3) * 0.08;
      p.ry += t * 0.9;
  } },
  { id: 'breathe', label: 'Breathe', icon: 'cloud-outline', apply: (t, p) => {
      const k = 1 + Math.sin(t * 1.1) * 0.045;
      p.sx *= k; p.sy *= k;
      p.y += Math.sin(t * 1.1) * 0.03;
  } },
  { id: 'jelly', label: 'Jelly', icon: 'water-outline', apply: (t, p) => {
      const w = Math.sin(t * 6) * Math.exp(-((t % 3) * 1.4));
      p.sx *= 1 + 0.09 * w; p.sy *= 1 - 0.09 * w;
      p.rz += 0.03 * w;
  } },
  { id: 'wobble', label: 'Wobble', icon: 'git-compare-outline', apply: (t, p) => {
      p.rz += Math.sin(t * 2.4) * 0.14;
      p.rx += Math.sin(t * 1.9 + 1) * 0.1;
  } },
  { id: 'bounce_spin', label: 'Bounce spin', icon: 'basketball-outline', apply: (t, p) => {
      const ph = (t % 1.8) / 1.8;
      p.y += Math.abs(Math.sin(ph * Math.PI)) * 0.55;
      p.ry += smooth01(Math.min(1, ph / 0.8)) * Math.PI * 2;
  } },
  { id: 'rock', label: 'Rock', icon: 'boat-outline', apply: (t, p) => {
      p.rz += Math.sin(t * 1.5) * 0.2;
      p.y += Math.abs(Math.sin(t * 1.5)) * 0.05;
  } },
  { id: 'zoom_pulse', label: 'Zoom pulse', icon: 'scan-outline', apply: (t, p) => {
      const k = 1 + (0.5 + 0.5 * Math.sin(t * 1.6)) * 0.16;
      p.sx *= k; p.sy *= k; p.sz *= k;
  } },
  { id: 'spiral_rise', label: 'Spiral rise', icon: 'trending-up-outline', apply: (t, p) => {
      const ph = (t % 4) / 4;
      p.y += smooth01(ph) * 0.6;
      p.ry += ph * Math.PI * 4;
      p.sx *= 1 - ph * 0.1; p.sy *= 1 - ph * 0.1;
  } },
  { id: 'drift', label: 'Drift', icon: 'navigate-outline', apply: (t, p) => {
      p.x += Math.sin(t * 0.35) * 0.45 + Math.sin(t * 0.9) * 0.05;
      p.y += Math.cos(t * 0.5) * 0.12;
      p.rz += Math.cos(t * 0.35) * 0.06;
  } },
  { id: 'tumble', label: 'Tumble', icon: 'dice-outline', apply: (t, p) => {
      const ph = (t % 6) / 6;
      p.rx += smooth01(Math.min(1, ph / 0.5)) * Math.PI * 2;
      p.y += Math.sin(Math.min(1, ph / 0.5) * Math.PI) * 0.18;
  } },
  { id: 'nod', label: 'Nod yes', icon: 'checkmark-circle-outline', apply: (t, p) => {
      const b = Math.max(0, Math.sin(t * 3.4)) * Math.max(0, Math.sin(t * 0.8));
      p.rx += b * 0.35;
  } },
  { id: 'shake_no', label: 'Shake no', icon: 'close-circle-outline', apply: (t, p) => {
      const b = Math.max(0, Math.sin(t * 0.9));
      p.ry += Math.sin(t * 7) * 0.3 * b;
  } },
  { id: 'sway', label: 'Sway', icon: 'musical-notes-outline', apply: (t, p) => {
      p.x += Math.sin(t * 1.2) * 0.2;
      p.rz += Math.sin(t * 1.2 + Math.PI / 2) * 0.12;
  } },
  { id: 'spring_drop', label: 'Spring drop', icon: 'arrow-down-circle-outline', apply: (t, p) => {
      const u = t % 4;
      const y = u < 3 ? Math.exp(-u * 1.5) * Math.cos(u * 9) * 0.7 : 0;
      p.y += y;
      p.sy *= 1 - Math.min(0, y) * 0.2;
  } },
  { id: 'glide_turn', label: 'Glide turn', icon: 'return-up-forward-outline', apply: (t, p) => {
      p.ry += Math.sin(t * 0.6) * 0.9;
      p.x += Math.sin(t * 0.6) * 0.15;
  } },
  { id: 'twinkle_scale', label: 'Twinkle', icon: 'sparkles-outline', apply: (t, p) => {
      const k = 1 + Math.max(0, Math.sin(t * 5)) * Math.max(0, Math.sin(t * 0.7)) * 0.1;
      p.sx *= k; p.sy *= k;
      p.rz += Math.sin(t * 5) * 0.02;
  } },
  { id: 'vertigo', label: 'Vertigo', icon: 'contract-outline', apply: (t, p) => {
      const k = 1 + Math.sin(t * 1.3) * 0.18;
      p.sx *= k; p.sy *= k; p.sz *= k;
      p.z += Math.sin(t * 1.3) * -0.3;
  } },
  { id: 'carousel', label: 'Carousel', icon: 'sync-circle-outline', apply: (t, p) => {
      p.ry += t * 0.55;
      p.y += Math.sin(t * 2.2) * 0.07;
  } },
  // ---- 10 premium effects (smooth, eased, loop-safe) ----
  { id: 'lissajous', label: 'Lissajous', icon: 'pulse-outline', apply: (t, p) => {
      p.x += Math.sin(t * 0.8) * 0.3;
      p.y += Math.sin(t * 1.2 + 0.8) * 0.14;
      p.z += Math.sin(t * 0.8 + Math.PI / 2) * 0.18;
      p.rz += Math.cos(t * 0.8) * 0.07;
  } },
  { id: 'helix', label: 'Helix', icon: 'git-merge-outline', apply: (t, p) => {
      const ph = (t % 5) / 5;
      const rise = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2); // up and back down, seamless loop
      p.x += Math.cos(t * 1.6) * 0.16 * rise;
      p.z += Math.sin(t * 1.6) * 0.16 * rise;
      p.y += rise * 0.5;
      p.ry += t * 1.2;
  } },
  { id: 'elastic', label: 'Elastic', icon: 'resize-outline', apply: (t, p) => {
      const u = t % 2.8;
      const w = Math.exp(-u * 2.2) * Math.sin(u * 11); // damped spring after each "pluck"
      p.sy *= 1 + 0.16 * w;
      p.sx *= 1 - 0.1 * w;
      p.y += 0.05 * w;
  } },
  { id: 'dreamy_spin', label: 'Dreamy spin', icon: 'moon-outline', apply: (t, p) => {
      const period = 7;
      const ph = (t % period) / period;
      const e = ph < 0.6 ? smooth01(smooth01(ph / 0.6)) : 1; // slow ease in/out turn, then a long calm hold
      p.ry += e * Math.PI * 2;
      p.y += Math.sin(t * 0.9) * 0.05;
      p.rz += Math.sin(t * 0.6) * 0.03;
  } },
  { id: 'ripple', label: 'Ripple', icon: 'radio-outline', apply: (t, p) => {
      const u = t % 2.4;
      const k = 1 + 0.07 * Math.exp(-u * 2.6) * Math.sin(u * 9 + Math.PI / 2); // concentric "water ripple" pulse
      p.sx *= k; p.sy *= k; p.sz *= k;
      p.y += (k - 1) * 0.6;
  } },
  { id: 'hummingbird', label: 'Hummingbird', icon: 'leaf-outline', apply: (t, p) => {
      p.x += Math.sin(t * 0.7) * 0.12 + Math.sin(t * 21) * 0.004;
      p.y += Math.sin(t * 1.1) * 0.08 + Math.sin(t * 27) * 0.004;
      p.rz += Math.sin(t * 17) * 0.006;
      p.ry += Math.sin(t * 0.7) * 0.14;
  } },
  { id: 'arc_glide', label: 'Arc glide', icon: 'analytics-outline', apply: (t, p) => {
      const a = Math.sin(t * 0.55); // swoops along a shallow arc and banks into the turn
      p.x += a * 0.42;
      p.z += (1 - Math.cos(a * 1.2)) * -0.5;
      p.rz += -a * 0.16;
      p.ry += a * 0.5;
      p.y += Math.sin(t * 1.1) * 0.04;
  } },
  { id: 'bloom', label: 'Bloom', icon: 'flower-outline', apply: (t, p) => {
      const period = 4.5;
      const ph = (t % period) / period;
      const open = ph < 0.55 ? smooth01(ph / 0.55) : 1 - smooth01((ph - 0.55) / 0.45); // opens, then softly closes
      const k = 0.9 + open * 0.14;
      p.sx *= k; p.sy *= k; p.sz *= k;
      p.ry += open * 0.9;
      p.y += open * 0.12;
  } },
  { id: 'metronome', label: 'Metronome', icon: 'timer-outline', apply: (t, p) => {
      const sw = Math.sin(t * 2.6);
      p.rz += Math.sign(sw) * Math.pow(Math.abs(sw), 0.55) * 0.2; // lingers at each extreme like a real pendulum
      p.x += Math.sign(sw) * Math.pow(Math.abs(sw), 0.55) * 0.07;
  } },
  { id: 'zero_g', label: 'Zero-G', icon: 'rocket-outline', apply: (t, p) => {
      p.rx += Math.sin(t * 0.5) * 0.28 + Math.sin(t * 0.23) * 0.12;
      p.ry += Math.sin(t * 0.37 + 1) * 0.42;
      p.rz += Math.sin(t * 0.43 + 2) * 0.2;
      p.y += Math.sin(t * 0.6) * 0.14;
      p.x += Math.sin(t * 0.31) * 0.08;
  } },
  // ---- 14 more premium effects (total 50) ----
  { id: 'snow_drift', label: 'Snow drift', icon: 'snow-outline', apply: (t, p) => {
      p.y += Math.sin(t * 0.8) * 0.07 + Math.sin(t * 1.9) * 0.02;
      p.x += Math.sin(t * 0.45) * 0.22 + Math.sin(t * 1.3) * 0.03;
      p.rz += Math.sin(t * 0.9 + 1) * 0.08;
      p.ry += Math.sin(t * 0.5) * 0.18;
  } },
  { id: 'conical_swing', label: 'Conical swing', icon: 'aperture-outline', apply: (t, p) => {
      const a = t * 1.3; // a pendulum swung in a circle, like a plumb bob
      p.x += Math.cos(a) * 0.2;
      p.z += Math.sin(a) * 0.2;
      p.rz += -Math.cos(a) * 0.14;
      p.rx += Math.sin(a) * 0.1;
  } },
  { id: 'surf_ride', label: 'Surf ride', icon: 'swap-vertical-outline', apply: (t, p) => {
      const w = Math.sin(t * 1.4);
      p.y += w * 0.14;
      p.rz += Math.cos(t * 1.4) * 0.16; // tilts with the slope of the wave
      p.x += Math.sin(t * 0.7) * 0.12;
  } },
  { id: 'showcase', label: 'Showcase', icon: 'ribbon-outline', apply: (t, p) => {
      const period = 8;
      const ph = (t % period) / period;
      const sweep = ph < 0.5 ? smooth01(ph / 0.5) : 1 - smooth01((ph - 0.5) / 0.5); // turns to show each side, then returns
      p.ry += (sweep - 0.5) * Math.PI * 0.9;
      p.y += Math.sin(t * 1.1) * 0.04;
  } },
  { id: 'pulse_float', label: 'Pulse float', icon: 'heart-half-outline', apply: (t, p) => {
      const ph = (t % 2.2) / 2.2;
      const b = Math.exp(-Math.pow((ph - 0.15) * 7, 2));
      p.y += Math.sin(t * 0.9) * 0.08 + b * 0.07;
      const k = 1 + 0.05 * b;
      p.sx *= k; p.sy *= k;
  } },
  { id: 'flutter', label: 'Flutter', icon: 'rose-outline', apply: (t, p) => {
      p.x += Math.sin(t * 1.1) * 0.2 + Math.sin(t * 3.1) * 0.03;
      p.y += Math.sin(t * 1.7) * 0.1 + Math.abs(Math.sin(t * 5.2)) * 0.03;
      p.rz += Math.sin(t * 5.2) * 0.07 + Math.sin(t * 1.1) * 0.1;
      p.ry += Math.sin(t * 1.1 + 1) * 0.25;
  } },
  { id: 'slingshot', label: 'Slingshot', icon: 'golf-outline', apply: (t, p) => {
      const period = 3.2;
      const ph = (t % period) / period;
      if (ph < 0.35) { // pull back and squeeze
        const k = smooth01(ph / 0.35);
        p.z += k * 0.25; p.y -= k * 0.06; p.sz *= 1 - k * 0.06;
      } else { // release: overshoot forward, then settle
        const u = (ph - 0.35) / 0.65;
        const w = Math.exp(-u * 4.5) * Math.cos(u * 14);
        p.z += w * 0.25; p.y += (1 - u) * 0.04;
      }
  } },
  { id: 'yoyo', label: 'Yo-yo', icon: 'repeat-outline', apply: (t, p) => {
      const ph = (t % 2.4) / 2.4;
      const d = ph < 0.5 ? smooth01(ph * 2) : 1 - smooth01((ph - 0.5) * 2); // down, pause at the bottom, back up
      p.y += (1 - d) * 0.5 - 0.1;
      p.rx += d * Math.PI * 2;
  } },
  { id: 'hologram', label: 'Hologram', icon: 'cube-outline', apply: (t, p) => {
      const g = Math.max(0, Math.sin(t * 0.9)) ** 12; // brief glitch bursts between calm spells
      p.ry += t * 0.5;
      p.y += Math.sin(t * 1.6) * 0.05;
      p.x += Math.sin(t * 61) * 0.025 * g;
      p.sx *= 1 + Math.sin(t * 47) * 0.03 * g;
  } },
  { id: 'tidal', label: 'Tidal', icon: 'water-outline', apply: (t, p) => {
      const s = Math.sin(t * 0.6);
      p.x += s * 0.34;
      p.y += Math.sin(t * 1.2) * 0.07;
      p.rz += s * 0.1 + Math.sin(t * 2.4) * 0.025;
  } },
  { id: 'corkscrew', label: 'Corkscrew', icon: 'git-pull-request-outline', apply: (t, p) => {
      p.rz += t * 0.9;
      p.x += Math.cos(t * 0.9) * 0.1;
      p.y += Math.sin(t * 0.9) * 0.1 + Math.sin(t * 0.45) * 0.06;
  } },
  { id: 'door_swing', label: 'Door swing', icon: 'exit-outline', apply: (t, p) => {
      const sw = Math.sin(t * 0.8);
      p.ry += sw * 0.75;
      p.x += (1 - Math.cos(sw * 0.75)) * 0.3; // hinges around one edge instead of the centre
      p.z += sw * 0.1;
  } },
  { id: 'lift_off', label: 'Lift off', icon: 'arrow-up-outline', apply: (t, p) => {
      const period = 5;
      const ph = (t % period) / period;
      const up = ph < 0.4 ? smooth01(ph / 0.4) : ph < 0.7 ? 1 : 1 - smooth01((ph - 0.7) / 0.3); // rise, hover, glide down
      p.y += up * 0.55;
      p.sx *= 1 - up * 0.05; p.sy *= 1 - up * 0.05; p.sz *= 1 - up * 0.05;
      p.rz += Math.sin(t * 2.2) * 0.04 * up;
      p.ry += up * 0.6;
  } },
  { id: 'precession', label: 'Precession', icon: 'color-filter-outline', apply: (t, p) => {
      const a = t * 0.8; // spins like a top whose axis slowly circles
      p.ry += t * 1.4;
      p.rx += Math.sin(a) * 0.18;
      p.rz += Math.cos(a) * 0.18;
      p.y += Math.sin(t * 1.1) * 0.04;
  } },
];
const MOTION_IDS = MOTION_EFFECTS.map((m) => m.id);
POSE_MODIFIERS.push(
  ...MOTION_EFFECTS.map<PoseModifier>((m) => ({
    id: `motion_${m.id}`,
    isActive: (s) => !!s.productEffects?.motions?.includes(m.id),
    apply: (t, _s, p) => m.apply(t, p),
  })),
);

/** Where the product sits in Camera Studio before any finger placement (also the pivot of the gestures). */
const CAMERA_MODE_BASE: Vec3 = [0, -0.35, 0];

function evaluatePose(spec: SceneSpec, t: number, mode: 'film' | 'camera', out: Pose) {
  const base = mode === 'camera' ? CAMERA_MODE_BASE : spec.product.position;
  const sc = spec.product.scale * (mode === 'camera' ? 0.85 : 1);
  out.x = base[0];
  out.y = base[1];
  out.z = base[2];
  // Camera Studio shows one flat image: it must keep facing the lens (no spin) and only float / bounce / get the effects.
  out.rx = mode === 'camera' ? 0 : spec.product.rotation[0];
  out.ry = mode === 'camera' ? 0 : spec.product.rotation[1];
  out.rz = mode === 'camera' ? 0 : spec.product.rotation[2];
  out.sx = out.sy = out.sz = sc;
  if (mode === 'camera') {
    const a = spec.animation.type;
    if (a === 'float' || a === 'float_rotate') floatBy(t, spec, out);
    else if (a === 'bounce') bounceBy(t, spec, out);
  } else {
    (ANIMATION_REGISTRY[spec.animation.type] ?? ANIMATION_REGISTRY.none)(t, spec, out);
  }
  for (const m of POSE_MODIFIERS) if (m.isActive(spec)) m.apply(t, spec, out);
}

type CamOut = { pos: THREE.Vector3; target: THREE.Vector3 };
type CameraFn = (t: number, s: SceneSpec, out: CamOut, targetY: number) => void;
const CAMERA_REGISTRY: Record<string, CameraFn> = {
  static: (_t, s, o, ty) => {
    o.pos.set(0, s.camera.height, s.camera.distance);
    o.target.set(0, ty, 0);
  },
  orbit: (t, s, o, ty) => {
    const a = (t / s.camera.duration) * Math.PI * 2;
    o.pos.set(Math.sin(a) * s.camera.distance, s.camera.height, Math.cos(a) * s.camera.distance);
    o.target.set(0, ty, 0);
  },
  push_in: (t, s, o, ty) => {
    const k = easeInOut(pingPong01(t / s.camera.duration));
    const d = lerp(s.camera.distance * 1.5, s.camera.distance * 0.75, k);
    o.pos.set(0, s.camera.height, d);
    o.target.set(0, ty, 0);
  },
  pull_out: (t, s, o, ty) => {
    const k = easeInOut(pingPong01(t / s.camera.duration));
    const d = lerp(s.camera.distance * 0.75, s.camera.distance * 1.5, k);
    o.pos.set(0, s.camera.height, d);
    o.target.set(0, ty, 0);
  },
  cinematic_orbit: (t, s, o, ty) => {
    // Professional feel: a sweeping arc (not a full spin) with slow dolly + crane drift.
    const w = (t / s.camera.duration) * Math.PI * 2;
    const a = Math.sin(w * 0.5) * 0.95;
    const r = s.camera.distance * (1 + 0.08 * Math.sin(w * 0.75));
    const y = s.camera.height + 0.25 * Math.sin(w * 0.6);
    o.pos.set(Math.sin(a) * r, y, Math.cos(a) * r);
    o.target.set(0, ty + 0.05 * Math.sin(w), 0);
  },
};

const CameraRig = memo(function CameraRig({ scene, clock, mode }: { scene: SceneSpec; clock: SimClock; mode: 'film' | 'camera' }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const out = useMemo<CamOut>(() => ({ pos: new THREE.Vector3(), target: new THREE.Vector3() }), []);
  useEffect(() => {
    camera.fov = scene.camera.fov;
    camera.near = 0.1;
    camera.far = 80;
    camera.updateProjectionMatrix();
  }, [camera, scene.camera.fov]);
  useFrame(() => {
    if (mode === 'camera') {
      out.pos.set(0, 0, scene.camera.distance);
      out.target.set(0, 0, 0);
    } else {
      (CAMERA_REGISTRY[scene.camera.type] ?? CAMERA_REGISTRY.static)(clock.current.t, scene, out, scene.product.position[1]);
    }
    camera.position.copy(out.pos);
    camera.lookAt(out.target);
  });
  return null;
});

const ProductRig = memo(function ProductRig({
  asset,
  scene,
  clock,
  mode,
  user,
  view,
}: {
  asset: ProductAsset;
  scene: SceneSpec;
  clock: SimClock;
  mode: 'film' | 'camera';
  user?: React.MutableRefObject<UserXform>;
  view?: ViewLabel;
}) {
  const g = useRef<THREE.Group>(null);
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const pose = useMemo<Pose>(() => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 }), []);
  useFrame((state) => {
    const grp = g.current;
    if (!grp) return;
    evaluatePose(scene, clock.current.t, mode, pose);
    grp.position.set(pose.x, pose.y, pose.z);
    grp.rotation.set(pose.rx, pose.ry, pose.rz);
    grp.scale.set(pose.sx, pose.sy, pose.sz);
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const u = user?.current;
    if (mode === 'camera' && u) {
      // Fractions of the preview box -> world units on the product plane (z = 0), using the exact camera maths.
      const visH = 2 * scene.camera.distance * Math.tan(THREE.MathUtils.degToRad(scene.camera.fov) / 2);
      const visW = visH * (state.size.width / state.size.height);
      // outer = T(pivot + move) * R * S, inner = T(-pivot): move / rotate / scale happen about the product centre.
      o.position.set(CAMERA_MODE_BASE[0] + u.x * visW, CAMERA_MODE_BASE[1] - u.y * visH, 0);
      o.rotation.set(0, 0, -u.rot);
      o.scale.setScalar(u.scale);
      i.position.set(-CAMERA_MODE_BASE[0], -CAMERA_MODE_BASE[1], 0);
    } else {
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(1);
      i.position.set(0, 0, 0);
    }
  });
  const env = getEnv(scene);
  return (
    <>
      <group ref={outer}>
        <group ref={inner}>
          <group ref={g}>
            <ProductModel asset={asset} only={mode === 'camera' ? view ?? 'front' : undefined} />
            <EffectsEngine slot="product" scene={scene} clock={clock} />
          </group>
        </group>
      </group>
      {mode === 'film' && <ContactShadow target={g} surfaceY={env.surfaceY(scene)} size={1.5 * scene.product.scale} />}
    </>
  );
});

/* ============================================================================
 * 10. EFFECTS ENGINE (registry - add hundreds of 3D effects)
 * ========================================================================== */

type EffectProps = { scene: SceneSpec; clock: SimClock };
type EffectDef = {
  id: string;
  slot: 'world' | 'product';
  isActive: (s: SceneSpec) => boolean;
  Component: React.ComponentType<EffectProps>;
};

/** "Bloom" approximation: additive halo behind the product (true post-processing is a production swap). */
const GlowEffect = memo(function GlowEffect({ scene }: EffectProps) {
  const def = LIGHTING_REGISTRY[scene.lighting.preset] ?? LIGHTING_REGISTRY.soft_studio;
  const b = scene.effects.bloom;
  const s = 3 * (0.6 + b * 2.2);
  return (
    <sprite scale={[s, s, 1]} position={[0, 0, -0.3]}>
      <spriteMaterial map={getProcTexture('radial')} color={def.rim.color} opacity={clamp(b * 1.4, 0, 0.7)} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
});

/** Depth-of-field approximation: soft bokeh discs whose size follows spec.effects.depthOfField. */
const BokehEffect = memo(function BokehEffect({ scene, clock }: EffectProps) {
  const ref = useRef<THREE.Points>(null);
  const N = 22;
  const pos = useMemo(() => {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      a[i * 3] = (hash2(i, 1) - 0.5) * 7;
      a[i * 3 + 1] = 0.3 + hash2(i, 2) * 3;
      a[i * 3 + 2] = -1.2 - hash2(i, 3) * 2.6;
    }
    return a;
  }, []);
  const def = LIGHTING_REGISTRY[scene.lighting.preset] ?? LIGHTING_REGISTRY.soft_studio;
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.current.t * 0.15) * 0.08;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial map={getProcTexture('disc')} size={0.25 + scene.effects.depthOfField * 0.9} color={def.key.color} transparent opacity={0.1 + scene.effects.depthOfField * 0.12} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
});

const ParticlesEffect = memo(function ParticlesEffect({ scene }: EffectProps) {
  const N = 140;
  const ref = useRef<THREE.Points>(null);
  const pos = useMemo(() => {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      a[i * 3] = (hash2(i, 5) - 0.5) * 5;
      a[i * 3 + 1] = hash2(i, 6) * 3;
      a[i * 3 + 2] = (hash2(i, 7) - 0.5) * 4;
    }
    return a;
  }, []);
  const speeds = useMemo(() => Float32Array.from({ length: N }, (_, i) => 0.05 + hash2(i, 9) * 0.18), []);
  const def = LIGHTING_REGISTRY[scene.lighting.preset] ?? LIGHTING_REGISTRY.soft_studio;
  useFrame((_, dt) => {
    const p = ref.current;
    if (!p) return;
    const attr = p.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const d = Math.min(dt, 0.05);
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] += speeds[i] * d;
      if (arr[i * 3 + 1] > 3.2) arr[i * 3 + 1] = 0;
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial map={getProcTexture('disc')} size={0.05} color={def.rim.color} transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
});

const FogEffect = memo(function FogEffect({ scene }: EffectProps) {
  return <fogExp2 attach="fog" args={[getEnv(scene).fogColor, scene.effects.fog]} />;
});

const EFFECT_REGISTRY: EffectDef[] = [
  { id: 'fog', slot: 'world', isActive: (s) => s.effects.fog > 0 && s.mode === 'film', Component: FogEffect },
  { id: 'depth_of_field', slot: 'world', isActive: (s) => s.effects.depthOfField > 0 && s.mode === 'film', Component: BokehEffect },
  { id: 'particles', slot: 'world', isActive: (s) => s.effects.particles, Component: ParticlesEffect },
  { id: 'bloom', slot: 'product', isActive: (s) => s.effects.bloom > 0.02, Component: GlowEffect },
];

const EffectsEngine = memo(function EffectsEngine({ slot, scene, clock }: { slot: 'world' | 'product'; scene: SceneSpec; clock: SimClock }) {
  return (
    <>
      {EFFECT_REGISTRY.filter((e) => e.slot === slot && e.isActive(scene)).map((e) => (
        <e.Component key={e.id} scene={scene} clock={clock} />
      ))}
    </>
  );
});

/** Screen-space effect (vignette) lives in RN so it costs nothing on the GL thread. */
const VignetteOverlay = memo(function VignetteOverlay({ on }: { on: boolean }) {
  if (!on) return null;
  const dark = 'rgba(0,0,0,0.38)';
  const clear = 'rgba(0,0,0,0)';
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[dark, clear]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '28%' }} />
      <LinearGradient colors={[clear, dark]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28%' }} />
      <LinearGradient colors={[dark, clear]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '22%' }} />
      <LinearGradient colors={[clear, dark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '22%' }} />
    </View>
  );
});

/* ============================================================================
 * 11. SHARED SCENE CANVAS + FILM STUDIO
 * ========================================================================== */

const ClockTicker = ({ clock, playingRef, holdRef }: { clock: SimClock; playingRef: React.MutableRefObject<boolean>; holdRef?: React.MutableRefObject<UserXform> }) => {
  useFrame((_, dt) => {
    // The product holds still while a finger is placing it.
    if (playingRef.current && !holdRef?.current.holding) clock.current.t += Math.min(dt, 0.05);
  });
  return null;
};

/**
 * Lets Harmonize grab the 3D foreground exactly as displayed: re-renders the current frame and reads the pixels
 * back in the same tick (before the GL buffer is presented), so pose, scale and framing match the preview.
 */
const SnapshotBridge = memo(function SnapshotBridge({ handle }: { handle: React.MutableRefObject<CaptureHandle> }) {
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  const camera = useThree((st) => st.camera);
  useEffect(() => {
    const h = handle.current;
    const fn = (): ForegroundSnapshot | null => {
      const ctx = gl.getContext() as WebGLRenderingContext;
      const width = ctx.drawingBufferWidth;
      const height = ctx.drawingBufferHeight;
      if (!width || !height) return null;
      gl.render(scene, camera);
      const pixels = new Uint8Array(width * height * 4);
      ctx.readPixels(0, 0, width, height, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels);
      return { width, height, pixels };
    };
    h.snapshotForeground = fn;
    return () => {
      if (h.snapshotForeground === fn) delete h.snapshotForeground;
    };
  }, [gl, scene, camera, handle]);
  return null;
});

/** One fixed renderer for both studios. It only INTERPRETS the SceneSpec. */
const SceneCanvas = memo(function SceneCanvas({
  asset,
  scene,
  mode,
  playing,
  hd,
  capture,
  user,
  view,
}: {
  asset: ProductAsset;
  scene: SceneSpec;
  mode: 'film' | 'camera';
  playing: boolean;
  hd: boolean;
  capture?: React.MutableRefObject<CaptureHandle>;
  user?: React.MutableRefObject<UserXform>;
  view?: ViewLabel;
}) {
  const clock = useRef({ t: 0 }) as SimClock;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const env = getEnv(scene);
  return (
    <Canvas
      style={StyleSheet.absoluteFill}
      dpr={hd ? [1, 2] : [1, 1]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, scene.camera.height, scene.camera.distance], fov: scene.camera.fov }}
      onCreated={({ gl }) => {
        if (mode === 'camera') gl.setClearColor(0x000000, 0);
      }}
    >
      <ClockTicker clock={clock} playingRef={playingRef} holdRef={user} />
      {capture && <SnapshotBridge handle={capture} />}
      {mode === 'film' && <color attach="background" args={[env.background]} />}
      <CameraRig scene={scene} clock={clock} mode={mode} />
      <LightingRig scene={scene} />
      {mode === 'film' && <env.Component scene={scene} />}
      <EffectsEngine slot="world" scene={scene} clock={clock} />
      <ProductRig asset={asset} scene={scene} clock={clock} mode={mode} user={user} view={view} />
    </Canvas>
  );
});

const FilmStudio = memo(function FilmStudio({
  product,
  scene,
  playing,
  hd,
}: {
  product: ProductAsset;
  scene: SceneSpec;
  playing: boolean;
  hd: boolean;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <SceneCanvas asset={product} scene={scene} mode="film" playing={playing} hd={hd} />
      <VignetteOverlay on={scene.effects.vignette} />
    </View>
  );
});

/* ============================================================================
 * 12. CAMERA STUDIO (live camera + camera effects)
 * ========================================================================== */

type CameraLayer =
  | { type: 'tint'; color: string; blend: ViewStyle['mixBlendMode']; opacity: number }
  | { type: 'blur'; intensity: number };

type CameraEffectDef = {
  id: keyof CameraBackground;
  label: string;
  icon: IconName;
  isActive: (cb: CameraBackground) => boolean;
  layers: (cb: CameraBackground) => CameraLayer[];
  toggle: (cb: CameraBackground) => CameraBackground;
};

/** Registry of live-frame effects drawn over the mock / expo camera feed. */
const CAMERA_EFFECT_REGISTRY: CameraEffectDef[] = [
  {
    id: 'invert',
    label: 'Invert',
    icon: 'contrast-outline',
    isActive: (c) => !!c.invert,
    layers: () => [{ type: 'tint', color: '#ffffff', blend: 'difference', opacity: 1 }],
    toggle: (c) => ({ ...c, invert: !c.invert }),
  },
  {
    id: 'grayscale',
    label: 'Gray',
    icon: 'moon-outline',
    isActive: (c) => !!c.grayscale,
    layers: () => [{ type: 'tint', color: '#808080', blend: 'saturation', opacity: 1 }],
    toggle: (c) => ({ ...c, grayscale: !c.grayscale }),
  },
  {
    id: 'blur',
    label: 'Blur',
    icon: 'water-outline',
    isActive: (c) => (c.blur ?? 0) > 0,
    layers: (c) => [{ type: 'blur', intensity: clamp((c.blur ?? 0) * 100, 0, 100) }],
    toggle: (c) => ({ ...c, blur: (c.blur ?? 0) > 0 ? 0 : 0.5 }),
  },
  {
    id: 'sepia',
    label: 'Sepia',
    icon: 'sunny-outline',
    isActive: (c) => !!c.sepia,
    layers: () => [
      { type: 'tint', color: '#808080', blend: 'saturation', opacity: 1 },
      { type: 'tint', color: '#c8a070', blend: 'multiply', opacity: 0.95 },
    ],
    toggle: (c) => ({ ...c, sepia: !c.sepia }),
  },
  {
    id: 'pencil',
    label: 'Pencil',
    icon: 'pencil-outline',
    isActive: (c) => !!c.pencil,
    layers: () => [
      { type: 'tint', color: '#808080', blend: 'saturation', opacity: 1 },
      { type: 'tint', color: '#ffffff', blend: 'overlay', opacity: 0.55 },
    ],
    toggle: (c) => ({ ...c, pencil: !c.pencil }),
  },
  {
    id: 'neon',
    label: 'Neon',
    icon: 'flash-outline',
    isActive: (c) => !!c.neon,
    layers: () => [
      { type: 'tint', color: '#ff2bd6', blend: 'color', opacity: 0.55 },
      { type: 'tint', color: '#00e5ff', blend: 'soft-light', opacity: 0.6 },
    ],
    toggle: (c) => ({ ...c, neon: !c.neon }),
  },
];

const CameraEffectsOverlay = memo(function CameraEffectsOverlay({ cb }: { cb: CameraBackground }) {
  const layers = CAMERA_EFFECT_REGISTRY.filter((e) => e.isActive(cb)).flatMap((e) => e.layers(cb).map((l, i) => ({ key: `${e.id}${i}`, l })));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {layers.map(({ key, l }) =>
        l.type === 'blur' ? (
          <BlurView key={key} intensity={l.intensity} tint="default" style={StyleSheet.absoluteFill} />
        ) : (
          <View key={key} style={[StyleSheet.absoluteFill, { backgroundColor: l.color, opacity: l.opacity, mixBlendMode: l.blend }]} />
        ),
      )}
    </View>
  );
});

/**
 * The live camera feed (expo-camera works in Expo Go). Asks for permission on first use; if it was denied for good,
 * shows a friendly card with a shortcut to the system settings instead of a blank preview.
 */
const LiveCameraBackground = memo(function LiveCameraBackground({ capture }: { capture: React.MutableRefObject<CaptureHandle> }) {
  const t = useTheme();
  const [perm, request] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) request();
  }, [perm, request]);
  useEffect(() => {
    const h = capture.current;
    const fn = async (): Promise<CapturedPhoto | null> => {
      const cam = camRef.current;
      if (!cam) return null;
      const res = await cam.takePictureAsync({ quality: 0.9, exif: true, skipProcessing: false });
      if (!res?.uri) return null;
      return { uri: res.uri, width: res.width, height: res.height, orientation: (res as any).exif?.Orientation };
    };
    h.takePhoto = fn;
    return () => {
      if (h.takePhoto === fn) delete h.takePhoto;
    };
  }, [capture, perm?.granted]);
  if (!perm) return <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0f18' }]} />;
  if (!perm.granted) {
    const blocked = !perm.canAskAgain;
    return (
      <LinearGradient colors={['#10131f', '#1b2033']} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 28 }]}>
        <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(t.primary, 0.2), marginBottom: 14 }}>
          <Ionicons name="camera-outline" size={30} color="#fff" />
        </View>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' }}>Camera access needed</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 280 }}>
          AR Camera places your product in front of the live camera. {blocked ? 'Turn the camera on for this app in your phone settings.' : 'Allow the camera to continue.'}
        </Text>
        <Pressable
          onPress={() => {
            haptic.tap();
            if (blocked) Linking.openSettings().catch(() => undefined);
            else request();
          }}
          accessibilityRole="button"
          style={{ marginTop: 16, height: 46, paddingHorizontal: 22, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{blocked ? 'Open settings' : 'Allow camera'}</Text>
        </Pressable>
      </LinearGradient>
    );
  }
  return <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />;
});

class Boundary extends React.Component<{ fallback: ReactNode; onError?: (e: unknown) => void; children?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error('[Magic3DStudio] render error', e);
    this.props.onError?.(e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/* ---- react-native-view-recorder: snapshot of the 3D preview (optional extra for Retouch) -------------------------- */
type ViewRecorderModuleShape = {
  RecordingView: React.ComponentType<any>;
  useViewRecorder: () => {
    sessionId: any;
    snapshot: (opts: { output: string; format: 'png' | 'jpg' }) => Promise<string>;
    /** Records the RecordingView's live content to an mp4 and resolves with its path. */
    record?: (opts: {
      output: string;
      fps: number;
      totalFrames: number;
      codec?: 'h264' | 'hevc' | 'hevcWithAlpha';
      /** Awaited before every frame is captured: the place to set up that frame's content. */
      onFrame?: (info: { frameIndex: number; totalFrames: number }) => void | Promise<void>;
    }) => Promise<string>;
  };
};
let viewRecorderCache: ViewRecorderModuleShape | null | undefined;
/**
 * Lazy: the package is only required the first time a 3D preview mounts, and only when its native module is linked
 * (development build). In Expo Go, or when anything fails, this returns null and the app simply works without the snapshot.
 * The result is cached for the whole session, so the hook below is always called (or never called): rules of hooks hold.
 * Install: `npx expo install react-native-view-recorder` (Metro needs the package installed to bundle this require).
 */
function loadViewRecorder(): ViewRecorderModuleShape | null {
  if (viewRecorderCache !== undefined) return viewRecorderCache;
  viewRecorderCache = null;
  try {
    // Guarded: absent (or unlinked) must not take the app down. require() synchronously, then pick the exports by name (ESM-interop safe).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rnViewRecorder = require('react-native-view-recorder');
    const src = rnViewRecorder?.useViewRecorder ? rnViewRecorder : rnViewRecorder?.default;
    // The JS package loads even when its native half is not linked (TurboModuleRegistry.get returns null instead of throwing): check it once, up front.
    if (!TurboModuleRegistry?.get?.('ViewRecorder')) {
      console.warn(
        '[ViewRecorder] JS package found but native module "ViewRecorder" is NOT linked. Rebuild the dev client after installing the package ' +
          '(npx expo run:ios / run:android or an EAS dev build) and make sure the New Architecture is enabled. The Retouch 3D snapshot is skipped.',
      );
    } else if (src?.useViewRecorder && src?.RecordingView) {
      viewRecorderCache = { RecordingView: src.RecordingView, useViewRecorder: src.useViewRecorder };
    } else {
      console.warn('[ViewRecorder] require() returned a module without useViewRecorder/RecordingView. Keys:', rnViewRecorder ? Object.keys(rnViewRecorder) : rnViewRecorder);
    }
  } catch (ex) {
    console.warn('[ViewRecorder] require("react-native-view-recorder") failed:', ex);
    viewRecorderCache = null;
  }
  return viewRecorderCache;
}

/* ---- react-native-view-shot: alternative snapshot of the 3D preview (backend 'canvassnapshotlib') ------------------ */
type ViewShotModuleShape = { captureRef: (ref: any, options?: any) => Promise<string> };
let viewShotCache: ViewShotModuleShape | null | undefined;
/**
 * Lazy and guarded, like loadViewRecorder(): null when the package is missing or unlinked (the snapshot is then skipped).
 * Install: `npx expo install react-native-view-shot` (works in Expo Go too).
 */
function loadViewShot(): ViewShotModuleShape | null {
  if (viewShotCache !== undefined) return viewShotCache;
  viewShotCache = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('react-native-view-shot');
    const captureRef = m?.captureRef ?? m?.default?.captureRef;
    if (typeof captureRef === 'function') viewShotCache = { captureRef };
    else console.warn('[ViewShot] require() returned a module without captureRef. Keys:', m ? Object.keys(m) : m);
  } catch (ex) {
    console.warn('[ViewShot] require("react-native-view-shot") failed:', ex);
    viewShotCache = null;
  }
  return viewShotCache;
}

/** Set by SnapshotFrame while the recorder is usable: resolves with a local PNG file uri of the 3D preview, or null. */
type SnapshotApi = {
  snapshot?: () => Promise<string | null>;
  /** Films the 3D canvas for totalFrames / fps seconds (no stop) and resolves with a local mp4 file uri, or null. Only set when the recorder supports record(). */
  record?: (o: { fps: number; totalFrames: number }) => Promise<string | null>;
};
/** true for a file the recorder just wrote (retouch_3d_<ms>.png in the cache). */
const isRecorderSnapshotUri = (uri: string) => /retouch_3d_\d+\.png$/.test(uri);
/** expo-file-system uri -> the plain native path the recorder writes to. */
const toNativeFilePath = (uri: string) => uri.replace(/^file:\/\//, '');

/** Hook half of the snapshot frame. Only mounted when the recorder module loaded, so useViewRecorder() runs on every render or never. */
const RecorderFrame = ({ mod, api, children }: { mod: ViewRecorderModuleShape; api: React.MutableRefObject<SnapshotApi>; children: React.ReactNode }) => {
  const recorder = mod.useViewRecorder();
  const RecordingView = mod.RecordingView;
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  useEffect(() => {
    api.current.snapshot = async () => {
      try {
        const out = { uri: `${Paths.cache.uri}retouch_3d_${Date.now()}.png` };
        let resultUri = await recorderRef.current.snapshot({ output: toNativeFilePath(out.uri), format: 'png' });
        resultUri = resultUri || out.uri;
        if (!resultUri.includes('file://')) resultUri = 'file://' + resultUri;
        return resultUri;
      } catch (e) {
        console.warn('[Magic3DStudio] 3D snapshot failed', e);
        return null;
      }
    };
    api.current.record =
      typeof recorderRef.current.record === 'function'
        ? async ({ fps, totalFrames }) => {
            const outFile = { uri: `${Paths.cache.uri}magic3d_canvas_${Date.now()}.mp4` };
            let uri = await recorderRef.current.record!({ output: toNativeFilePath(outFile.uri), fps, totalFrames, codec: 'h264' });
            if (uri && !uri.includes('file://')) uri = 'file://' + uri;
            return uri || null;
          }
        : undefined;
    return () => {
      api.current.snapshot = undefined;
      api.current.record = undefined;
    };
  }, [api]);
  return (
    <RecordingView sessionId={recorder.sessionId} collapsable={false} style={StyleSheet.absoluteFill}>
      {children}
    </RecordingView>
  );
};

/**
 * Wraps the 3D preview so it can be captured as an image. Without the recorder (Expo Go, missing package, any error) it renders
 * the children untouched and exposes no snapshot function.
 */
/** react-native-view-shot half: a plain collapsable={false} View that captureRef() turns into a retouch_3d_<ms>.png in the cache. */
const ViewShotFrame = ({ mod, api, children }: { mod: ViewShotModuleShape; api: React.MutableRefObject<SnapshotApi>; children: React.ReactNode }) => {
  const viewRef = useRef<View>(null);
  useEffect(() => {
    api.current.snapshot = async () => {
      try {
        if (!viewRef.current) return null;
        const tmp = await mod.captureRef(viewRef.current, { format: 'png', quality: 1, result: 'tmpfile' });
        if (!tmp) return null;
        const src = tmp.includes('file://') ? tmp : 'file://' + tmp;
        try {
          // same name pattern as the recorder, so isRecorderSnapshotUri() / the upload treat both alike
          const dest = new File(`${Paths.cache.uri}retouch_3d_${Date.now()}.png`);
          new File(src).copy(dest);
          return dest.uri;
        } catch (e) {
          console.warn('[Magic3DStudio] view-shot: could not rename the snapshot, using the temp file', e);
          return src;
        }
      } catch (e) {
        console.warn('[Magic3DStudio] 3D snapshot (view-shot) failed', e);
        return null;
      }
    };
    api.current.record = undefined; // no recording with view-shot: Record keeps the turbo screen recorder flow
    return () => {
      api.current.snapshot = undefined;
    };
  }, [api, mod]);
  return (
    <View ref={viewRef} collapsable={false} style={StyleSheet.absoluteFill}>
      {children}
    </View>
  );
};

const SnapshotFrame = ({ api, lib = DEFAULT_3D_CANVAS_SNAPSHOT_LIB, children }: { api: React.MutableRefObject<SnapshotApi>; lib?: SnapshotLib; children: React.ReactNode }) => {
  if (lib === 'react-native-view-shot') {
    const shot = loadViewShot();
    if (!shot) return <>{children}</>;
    return (
      <Boundary fallback={<>{children}</>}>
        <ViewShotFrame mod={shot} api={api}>
          {children}
        </ViewShotFrame>
      </Boundary>
    );
  }
  const mod = loadViewRecorder();
  if (!mod) return <>{children}</>;
  return (
    <Boundary fallback={<>{children}</>}>
      <RecorderFrame mod={mod} api={api}>
        {children}
      </RecorderFrame>
    </Boundary>
  );
};


const CameraStudio = memo(function CameraStudio({
  product,
  scene,
  playing,
  hd,
  capture,
  user,
  view,
}: {
  product: ProductAsset;
  scene: SceneSpec;
  playing: boolean;
  hd: boolean;
  capture: React.MutableRefObject<CaptureHandle>;
  user: React.MutableRefObject<UserXform>;
  view: ViewLabel;
}) {
  const cb = scene.cameraBackground ?? {};

  return (
    <View style={StyleSheet.absoluteFill}>
      <LiveCameraBackground capture={capture} />
      <CameraEffectsOverlay cb={cb} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <SceneCanvas asset={product} scene={scene} mode="camera" playing={playing} hd={hd} capture={capture} user={user} view={view} />
      </View>
    </View>
  );
});

/* ============================================================================
 * 13. UI COMPONENTS
 * ========================================================================== */

const ThemeContext = createContext<Theme>(THEME_REGISTRY[DEFAULT_THEME_ID]);
const useTheme = () => useContext(ThemeContext);

/* ---- Design system primitives: motion, touch targets, Reduce Motion, Surface, Skeleton, EmptyState ---- */

/** One motion vocabulary: fast = feedback, base = state change, slow = reveals; spring = playful emphasis. */
const MOTION = { fast: 140, base: 220, slow: 360, spring: { friction: 7, tension: 90 } } as const;
/** Minimum comfortable touch target (pt). Smaller visuals get a hitSlop up to this size. */
const TOUCH_MIN = 44;
const hitFor = (size: number) => {
  const p = Math.max(0, Math.ceil((TOUCH_MIN - size) / 2));
  return { top: p, bottom: p, left: p, right: p };
};

/** true when the system "Reduce Motion" / "Remove animations" setting is on: loops stop, reveals shorten, tilt turns off. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(!!v)).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduce(!!v));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** The three card looks used across the app: solid (default), glass (over photos), tinted (highlight). */
const Surface = ({ variant = 'solid', radius = RADIUS.xl, padding = SP.md, style, children }: { variant?: 'solid' | 'glass' | 'tinted'; radius?: number; padding?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) => {
  const t = useTheme();
  const look: ViewStyle =
    variant === 'glass'
      ? { backgroundColor: 'rgba(18,20,28,0.34)', borderColor: 'rgba(255,255,255,0.22)', borderWidth: 1, overflow: 'hidden' }
      : variant === 'tinted'
        ? { backgroundColor: hexToRgba(t.primary, 0.08), borderColor: hexToRgba(t.primary, 0.28), borderWidth: 1 }
        : { backgroundColor: t.surface, borderColor: t.border, borderWidth: 1 };
  return (
    <View style={[{ borderRadius: radius, padding }, look, style]}>
      {variant === 'glass' && <BlurView intensity={Platform.OS === 'ios' ? 40 : 20} tint="dark" style={StyleSheet.absoluteFill} />}
      {children}
    </View>
  );
};

/** Shimmering placeholder block: use instead of a spinner when the shape of the content is known. */
const Skeleton = memo(function Skeleton({ width, height, radius = RADIUS.md, style }: { width: number | `${number}%`; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const l = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true })]));
    l.start();
    return () => l.stop();
  }, [v, reduce]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width, height, borderRadius: radius, backgroundColor: hexToRgba(t.textMuted, 0.18), opacity: reduce ? 0.7 : v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] }) }, style]} />;
});

/** Empty and error states share one layout: round icon, title, one line of help, optional action. */
const EmptyState = ({ icon, title, body, actionLabel, onAction, tone = 'neutral' }: { icon: IconName; title: string; body?: string; actionLabel?: string; onAction?: () => void; tone?: 'neutral' | 'error' }) => {
  const t = useTheme();
  const c = tone === 'error' ? '#E5484D' : t.primary;
  return (
    <View style={{ alignItems: 'center', paddingVertical: SP.xl, paddingHorizontal: SP.xl }} accessibilityRole="summary">
      <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(c, 0.12), marginBottom: SP.md }}>
        <Ionicons name={icon} size={34} color={c} />
      </View>
      <Text style={{ color: t.text, ...TYPE.title, fontSize: 16, textAlign: 'center' }}>{title}</Text>
      {!!body && <Text style={{ color: t.textMuted, ...TYPE.body, fontSize: 13, textAlign: 'center', marginTop: 6, maxWidth: 300 }}>{body}</Text>}
      {!!actionLabel && !!onAction && (
        <Pressable onPress={onAction} accessibilityRole="button" style={{ marginTop: SP.lg, minHeight: TOUCH_MIN, paddingHorizontal: SP.xl, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(c, 0.14) }}>
          <Text style={{ color: c, fontWeight: '800', fontSize: 14 }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
});

const REC_RED = '#FF3B5C';
/** While recording the 3D scene the controls stay at the very bottom, as small as is still safe to tap. */
const REC_BTN_SIZE = 30;
const REC_BADGE_H = 20; // approximate height of the compact REC badge (used to centre it against the button)
/**
 * Recording decorations: breathing red edge glow, viewfinder corner marks and the scanning beam.
 * Default OFF so nothing but the tiny REC badge + button is drawn over the 3D scene; set true to bring them back.
 * (The REC badge, the record button and the start flash are not affected by this flag.)
 */
const REC_SHOW_DECORATIONS = false;
/** Side margin of the REC badge / button: wide enough to clear the corner marks when they are on, tight to the edge when off. */
const REC_EDGE = REC_SHOW_DECORATIONS ? 44 : 16;

/** Glass record / stop button: glossy rim, frosted well and a jewel-like red core that morphs into a stop square, with a pulsing halo. */
const RecordButton = memo(function RecordButton({ state, onPress, size = 42 }: { state: RecState; onPress: () => void; size?: number }) {
  const recording = state === 'recording' || state === 'stopping';
  const morph = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(morph, { toValue: recording ? 1 : 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [recording, morph]);

  useEffect(() => {
    if (!recording) {
      halo.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(halo, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [recording, halo]);

  const inner = morph.interpolate({ inputRange: [0, 1], outputRange: [size * 0.5, size * 0.32] });
  const radius = morph.interpolate({ inputRange: [0, 1], outputRange: [size * 0.25, size * 0.09] });
  const glossOpacity = morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });
  const small = size < 40;
  const ringW = small ? 1.5 : Math.max(2, Math.round(size * 0.05));
  // glossy white rim while idle, turns red while recording
  const ringColors: [string, string] = recording ? ['#FFB8C4', REC_RED] : ['rgba(255,255,255,0.98)', 'rgba(255,255,255,0.45)'];
  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
  const pressTo = (v: number) => Animated.spring(press, { toValue: v, speed: 40, bounciness: 6, useNativeDriver: true }).start();
  const busy = state === 'starting' || state === 'stopping';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => pressTo(0.92)}
      onPressOut={() => pressTo(1)}
      disabled={busy}
      hitSlop={small ? 18 : 12} // the small button keeps a comfortable touch area
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
    >
      <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1, transform: [{ scale: press }] }}>
        {recording && (
          <Animated.View
            pointerEvents="none"
            style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: REC_RED, backgroundColor: 'rgba(255,59,92,0.16)', opacity: haloOpacity, transform: [{ scale: haloScale }] }}
          />
        )}
        {/* soft shadow (red glow while recording) */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            shadowColor: recording ? REC_RED : '#000',
            shadowOpacity: recording ? (small ? 0.5 : 0.65) : 0.4,
            shadowRadius: recording ? (small ? 6 : 12) : small ? 4 : 9,
            shadowOffset: { width: 0, height: recording ? 0 : 3 },
          }}
        >
          {/* glossy rim */}
          <LinearGradient colors={ringColors} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={{ flex: 1, borderRadius: size / 2, padding: ringW }}>
            {/* frosted-glass well */}
            <View style={{ flex: 1, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,16,26,0.5)' }}>
              {!small && Platform.OS === 'ios' && <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />}
              {/* faint light on the upper half of the glass */}
              <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%' }} />
              {/* the red core: round dot -> rounded stop square */}
              <Animated.View style={{ width: inner, height: inner, borderRadius: radius, backgroundColor: REC_RED, shadowColor: REC_RED, shadowOpacity: 0.9, shadowRadius: small ? 3 : 7, shadowOffset: { width: 0, height: 0 } }}>
                <Animated.View style={{ ...StyleSheet.absoluteFill, borderRadius: radius, overflow: 'hidden' }}>
                  <LinearGradient colors={['#FF8CA0', REC_RED, '#D40E36']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ flex: 1 }} />
                  <Animated.View pointerEvents="none" style={{ position: 'absolute', top: '8%', left: '17%', right: '17%', height: '38%', borderRadius: 999, overflow: 'hidden', opacity: glossOpacity }}>
                    <LinearGradient colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']} style={{ flex: 1 }} />
                  </Animated.View>
                </Animated.View>
              </Animated.View>
            </View>
          </LinearGradient>
        </View>
      </Animated.View>
    </Pressable>
  );
});

/** Own interval so the 2 Hz clock never re-renders the whole screen. */
const RecTimer = memo(function RecTimer({ startedAt, fontSize = 12 }: { startedAt: number; fontSize?: number }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const tick = () => setSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [startedAt]);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return <Text style={{ color: '#fff', fontWeight: '800', fontSize, fontVariant: ['tabular-nums'] }}>{`${mm}:${ss}`}</Text>;
});

/** Visuals while recording: breathing edge glow, viewfinder corners, scanning beam, start flash and a REC badge. */
const RecordingOverlay = memo(function RecordingOverlay({
  startedAt,
  fps,
  inset,
  compact = false,
}: {
  startedAt: number;
  fps: number;
  inset?: { left: number; bottom?: number; top?: number };
  /** Tiny REC badge (dot + time + fps) for recording the 3D scene with as little on screen as possible. */
  compact?: boolean;
}) {
  const [h, setH] = useState(0);
  const breathe = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(blink, { toValue: 0.15, duration: 520, useNativeDriver: true }),
          Animated.timing(blink, { toValue: 1, duration: 520, useNativeDriver: true }),
        ]),
      ),
      Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.quad), useNativeDriver: true })),
    ];
    // The glow and the beam are only drawn when REC_SHOW_DECORATIONS is on, so their loops only run then (saves battery while recording).
    const active = REC_SHOW_DECORATIONS ? loops : [loops[1]]; // the REC dot still blinks
    active.forEach((l) => l.start());
    Animated.timing(flash, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    return () => active.forEach((l) => l.stop());
  }, [breathe, blink, sweep, flash]);

  const glow = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.95] });
  const beamY = sweep.interpolate({ inputRange: [0, 1], outputRange: [-80, Math.max(h, 80)] });
  const edge = 'rgba(255,59,92,0.6)';
  const none = 'rgba(255,59,92,0)';
  const corner = (key: string, pos: ViewStyle, borders: ViewStyle) => (
    <View key={key} style={[{ position: 'absolute', width: 24, height: 24, borderColor: 'rgba(255,255,255,0.9)' }, pos, borders]} />
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {REC_SHOW_DECORATIONS && (
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: glow }]}>
        <LinearGradient colors={[edge, none]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44 }} />
        <LinearGradient colors={[none, edge]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 44 }} />
        <LinearGradient colors={[edge, none]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 44 }} />
        <LinearGradient colors={[none, edge]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 44 }} />
      </Animated.View>
      )}

      {REC_SHOW_DECORATIONS && (
        <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 80, transform: [{ translateY: beamY }] }}>
          <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,120,150,0.18)', 'rgba(255,255,255,0)']} style={{ flex: 1 }} />
        </Animated.View>
      )}

      {REC_SHOW_DECORATIONS && corner('tl', { top: 14, left: 14 }, { borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 })}
      {REC_SHOW_DECORATIONS && corner('tr', { top: 14, right: 14 }, { borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 })}
      {REC_SHOW_DECORATIONS && corner('bl', { bottom: 14, left: 14 }, { borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 })}
      {REC_SHOW_DECORATIONS && corner('br', { bottom: 14, right: 14 }, { borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 })}

      <View
        style={{
          position: 'absolute',
          left: inset?.left ?? 24,
          ...(inset?.top !== undefined ? { top: inset.top } : { bottom: inset?.bottom ?? 24 }),
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? 4 : 8,
          paddingHorizontal: compact ? 7 : 12,
          paddingVertical: compact ? 3 : 7,
          borderRadius: 999,
          backgroundColor: compact ? 'rgba(20,10,16,0.5)' : 'rgba(20,10,16,0.62)',
          borderWidth: compact ? 0.5 : 1,
          borderColor: 'rgba(255,59,92,0.6)',
        }}
      >
        <Animated.View style={{ width: compact ? 6 : 9, height: compact ? 6 : 9, borderRadius: 5, backgroundColor: REC_RED, opacity: blink }} />
        {!compact && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1 }}>REC</Text>}
        <RecTimer startedAt={startedAt} fontSize={compact ? 10 : 12} />
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: compact ? 9 : 11 }}>{fps}fps</Text>
      </View>

      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flash }]} />
    </View>
  );
});

/**
 * Touch layer over the Camera Studio preview: one finger moves, two fingers pinch-zoom and rotate - all about the
 * product's centre, with the pinch centred between the fingers (like a photo editor). Raw touch deltas are applied
 * 1:1 (no smoothing, no thresholds) and stored as fractions of the preview box, so the 3D scene - and therefore the
 * Harmonize snapshot - shows exactly what the fingers placed. Double-tap resets.
 */
const GestureSurface = memo(function GestureSurface({
  user,
  pivotY,
  onChange,
  onReset,
}: {
  user: React.MutableRefObject<UserXform>;
  pivotY: number;
  onChange: () => void;
  onReset: () => void;
}) {
  const [active, setActive] = useState(false);
  const box = useRef({ w: 1, h: 1 });
  const pivot = useRef(pivotY);
  pivot.current = pivotY;
  const cbs = useRef({ onChange, onReset });
  cbs.current = { onChange, onReset };
  const prev = useRef<{ x: number; y: number }[]>([]);
  const tap = useRef({ start: 0, x: 0, y: 0, moved: 0, fingers: 0, lastEnd: 0 });
  const notified = useRef(false);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // never let the ScrollView steal the gesture
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const pts = e.nativeEvent.touches.map((tt) => ({ x: tt.locationX, y: tt.locationY }));
        prev.current = pts;
        user.current.holding = true;
        notified.current = false;
        tap.current.start = Date.now();
        tap.current.fingers = pts.length;
        tap.current.moved = 0;
        if (pts[0]) {
          tap.current.x = pts[0].x;
          tap.current.y = pts[0].y;
        }
        setActive(true);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const pts = e.nativeEvent.touches.map((tt) => ({ x: tt.locationX, y: tt.locationY }));
        const before = prev.current;
        prev.current = pts;
        if (pts.length > 1) tap.current.fingers = 2;
        if (pts[0]) tap.current.moved = Math.max(tap.current.moved, Math.hypot(pts[0].x - tap.current.x, pts[0].y - tap.current.y));
        // A finger was added or lifted: just re-baseline, never jump.
        if (before.length === 0 || pts.length !== before.length) return;
        const { w, h } = box.current;
        const mid = (a: { x: number; y: number }[]) => ({ x: a.reduce((q, v) => q + v.x, 0) / a.length, y: a.reduce((q, v) => q + v.y, 0) / a.length });
        const m0 = mid(before);
        const m1 = mid(pts);
        let k = 1;
        let dth = 0;
        if (pts.length >= 2) {
          const d0 = Math.hypot(before[1].x - before[0].x, before[1].y - before[0].y);
          const d1 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          if (d0 > 6) k = d1 / d0;
          let da = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) - Math.atan2(before[1].y - before[0].y, before[1].x - before[0].x);
          if (da > Math.PI) da -= 2 * Math.PI;
          if (da < -Math.PI) da += 2 * Math.PI;
          dth = da;
        }
        const u = user.current;
        const newScale = clamp(u.scale * k, USER_SCALE_MIN, USER_SCALE_MAX);
        k = newScale / u.scale;
        // Product centre on screen, move it as a point attached to the fingers.
        const cx = w / 2 + u.x * w;
        const cy = h / 2 + (pivot.current + u.y) * h;
        const vx = cx - m0.x;
        const vy = cy - m0.y;
        const cos = Math.cos(dth);
        const sin = Math.sin(dth);
        const nx = clamp(m1.x + k * (vx * cos - vy * sin), 0, w); // keep the product reachable
        const ny = clamp(m1.y + k * (vx * sin + vy * cos), 0, h);
        u.x = (nx - w / 2) / w;
        u.y = (ny - h / 2) / h - pivot.current;
        u.scale = newScale;
        u.rot += dth;
        if (!notified.current) {
          notified.current = true;
          cbs.current.onChange();
        }
      },
      onPanResponderRelease: () => {
        const tp = tap.current;
        const now = Date.now();
        const isTap = tp.fingers === 1 && now - tp.start < 250 && tp.moved < 12;
        if (isTap && now - tp.lastEnd < 320) {
          tp.lastEnd = 0;
          cbs.current.onReset();
        } else {
          tp.lastEnd = isTap ? now : 0;
        }
        user.current.holding = false;
        prev.current = [];
        setActive(false);
      },
      onPanResponderTerminate: () => {
        user.current.holding = false;
        prev.current = [];
        setActive(false);
      },
    }),
  ).current;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        box.current = { w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) };
      }}
      {...responder.panHandlers}
    >
      {active && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {[1 / 3, 2 / 3].map((f) => (
            <View key={`v${f}`} style={{ position: 'absolute', left: `${f * 100}%`, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.45)' }} />
          ))}
          {[1 / 3, 2 / 3].map((f) => (
            <View key={`h${f}`} style={{ position: 'absolute', top: `${f * 100}%`, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' }} />
          ))}
        </View>
      )}
    </View>
  );
});

/** Gradient "Harmonize" action with a soft pulse + travelling shine; shows a spinner while the job runs. */
const HarmonizeButton = memo(function HarmonizeButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l1 = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const l2 = Animated.loop(Animated.timing(shine, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    l1.start();
    l2.start();
    return () => {
      l1.stop();
      l2.stop();
    };
  }, [pulse, shine]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-80, 200] });
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Harmonize"
    >
      <Animated.View
        style={{ transform: [{ scale }], opacity: busy ? 0.8 : 1, shadowColor: '#8E7BFF', shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
      >
        <LinearGradient
          colors={['#7C6CFF', '#FF6FB5', '#FFB36B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ height: 46, paddingLeft: 8, paddingRight: 18, borderRadius: 23, flexDirection: 'row', alignItems: 'center', gap: 9, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)' }}
        >
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' }}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="color-wand" size={17} color="#fff" />}
          </View>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.3 }}>{busy ? 'Harmonizing…' : 'Harmonize'}</Text>
          {!busy && (
            <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: 44, transform: [{ translateX: shineX }, { skewX: '-20deg' }] }}>
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
            </Animated.View>
          )}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
});

/** Short messages that rotate while the cloud harmonizes (it takes a while, so the screen keeps telling a story). */
const HARMONIZE_TIPS = ['Matching the light direction', 'Balancing colour temperature', 'Softening the cut-out edges', 'Adding natural shadows', 'Grading it like a studio shot'];
const HARMONIZE_TIP_ICONS: IconName[] = ['sunny-outline', 'thermometer-outline', 'cut-outline', 'contrast-outline', 'color-palette-outline'];
const HARMONIZE_STAGES: { id: HarmonizeStage; label: string; icon: IconName }[] = [
  { id: 'capturing', label: 'Capture', icon: 'camera-outline' },
  { id: 'blending', label: 'Blend', icon: 'layers-outline' },
  { id: 'harmonizing', label: 'Harmonize', icon: 'color-wand-outline' },
];

/** A point on the centre line of a rounded rectangle, s = 0..1 around the perimeter starting after the top-left corner. */
function roundedRectPoint(s: number, w: number, h: number, r: number): { x: number; y: number } {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const arc = (Math.PI * rr) / 2;
  const segs = [w - 2 * rr, arc, h - 2 * rr, arc, w - 2 * rr, arc, h - 2 * rr, arc];
  const total = segs.reduce((p, q) => p + q, 0);
  let d = (((s % 1) + 1) % 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = segs[i] > 0 ? d / segs[i] : 0;
      switch (i) {
        case 0: return { x: rr + k * (w - 2 * rr), y: 0 };
        case 1: { const ang = -Math.PI / 2 + k * (Math.PI / 2); return { x: w - rr + rr * Math.cos(ang), y: rr + rr * Math.sin(ang) }; }
        case 2: return { x: w, y: rr + k * (h - 2 * rr) };
        case 3: { const ang = k * (Math.PI / 2); return { x: w - rr + rr * Math.cos(ang), y: h - rr + rr * Math.sin(ang) }; }
        case 4: return { x: w - rr - k * (w - 2 * rr), y: h };
        case 5: { const ang = Math.PI / 2 + k * (Math.PI / 2); return { x: rr + rr * Math.cos(ang), y: h - rr + rr * Math.sin(ang) }; }
        case 6: return { x: 0, y: h - rr - k * (h - 2 * rr) };
        default: { const ang = Math.PI + k * (Math.PI / 2); return { x: rr + rr * Math.cos(ang), y: rr + rr * Math.sin(ang) }; }
      }
    }
    d -= segs[i];
  }
  return { x: 0, y: 0 };
}

/**
 * Shown over the preview while Harmonize runs: shutter flash, the blended frame (same box, so it lines up 1:1),
 * drifting aurora light, viewfinder corners, a scan beam and rising sparkles - and, in the centre, a see-through glass card
 * (the product stays visible behind it) with a glowing edge and two comets of light circling it, a glowing orbit orb, the
 * three stages (capture / blend / harmonize), a rotating tip and a seconds counter.
 */
const HarmonizeOverlay = memo(function HarmonizeOverlay({ stage, blendedUri }: { stage: HarmonizeStage; blendedUri?: string }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const flash = useRef(new Animated.Value(0.9)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const edge = useRef(new Animated.Value(0)).current;
  const head = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const tipFade = useRef(new Animated.Value(1)).current;
  const sparks = useRef(
    Array.from({ length: 16 }, (_, i) => ({ v: new Animated.Value(0), x: ((i * 37 + 11) % 100) / 100, size: 3 + (i % 3) * 2, delay: (i * 310) % 2800, dur: 2800 + (i % 4) * 550 })),
  ).current;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [cardBox, setCardBox] = useState({ w: 0, h: 0 });
  const [tip, setTip] = useState(0);
  const [secs, setSecs] = useState(0);
  const stageIdx = HARMONIZE_STAGES.findIndex((x) => x.id === stage);
  const CARD_R = 30;

  useEffect(() => {
    Animated.timing(flash, { toValue: 0, duration: 420, useNativeDriver: true }).start();
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
    if (reduce) return;
    const sine = (v: Animated.Value, ms: number) =>
      Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    const loops = [
      Animated.loop(Animated.sequence([Animated.timing(sweep, { toValue: 1, duration: 2700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }), Animated.delay(150), Animated.timing(sweep, { toValue: 0, duration: 2700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }), Animated.delay(150)])),
      Animated.loop(Animated.sequence([Animated.timing(head, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(head, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true })])),
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.timing(edge, { toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: true })),
      sine(breathe, 1100),
      sine(drift, 4200),
      ...sparks.map((sp) => Animated.loop(Animated.sequence([Animated.delay(sp.delay), Animated.timing(sp.v, { toValue: 1, duration: sp.dur, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(sp.v, { toValue: 0, duration: 0, useNativeDriver: true })]))),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [flash, enter, sweep, head, spin, edge, breathe, drift, sparks, reduce]);

  useEffect(() => {
    const tick = setInterval(() => setSecs((n) => n + 1), 1000);
    const tipTimer = setInterval(() => {
      Animated.timing(tipFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setTip((n) => (n + 1) % HARMONIZE_TIPS.length);
        Animated.timing(tipFade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, 3200);
    return () => {
      clearInterval(tick);
      clearInterval(tipTimer);
    };
  }, [tipFade]);
  useEffect(() => {
    if (blendedUri) Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [blendedUri, fade]);

  // two comets of light (each with a fading tail) circling the card's edge
  const comets = useMemo(() => {
    if (cardBox.w <= 0 || cardBox.h <= 0) return [] as { key: string; size: number; alpha: number; tx: Animated.AnimatedInterpolation<number>; ty: Animated.AnimatedInterpolation<number> }[];
    const N = 72;
    const input = Array.from({ length: N + 1 }, (_, i) => i / N);
    const out: { key: string; size: number; alpha: number; tx: Animated.AnimatedInterpolation<number>; ty: Animated.AnimatedInterpolation<number> }[] = [];
    [0, 0.5].forEach((phase, ci) => {
      [0, 0.012, 0.026, 0.044].forEach((lag, li) => {
        const size = [9, 7, 5.5, 4][li];
        const pts = input.map((s) => roundedRectPoint(s - lag + phase, cardBox.w, cardBox.h, CARD_R));
        out.push({
          key: `${ci}-${li}`,
          size,
          alpha: [1, 0.7, 0.4, 0.2][li],
          tx: edge.interpolate({ inputRange: input, outputRange: pts.map((p) => p.x - size / 2) }),
          ty: edge.interpolate({ inputRange: input, outputRange: pts.map((p) => p.y - size / 2) }),
        });
      });
    });
    return out;
  }, [cardBox.w, cardBox.h, edge]);

  // scanner: the beam position in px, and a lattice of dots whose rows light up as the beam passes
  const beamY = useMemo(() => sweep.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(box.h, 1)] }), [sweep, box.h]);
  const lattice = useMemo(() => {
    if (box.w <= 0 || box.h <= 0) return { rows: [] as Animated.AnimatedInterpolation<number>[], cols: 0, sy: 0 };
    const cols = Math.max(6, Math.floor(box.w / 30));
    const rowsN = Math.max(6, Math.floor(box.h / 30));
    const sy = box.h / rowsN;
    const reach = Math.max(70, box.h * 0.2);
    const rows = Array.from({ length: rowsN }, (_, i) => {
      const y = (i + 0.5) * sy;
      return beamY.interpolate({ inputRange: [y - reach, y - reach * 0.3, y, y + reach * 0.3, y + reach], outputRange: [0.06, 0.4, 1, 0.4, 0.06], extrapolate: 'clamp' });
    });
    return { rows, cols, sy };
  }, [beamY, box.w, box.h]);
  const headX = head.interpolate({ inputRange: [0, 1], outputRange: [28, Math.max(box.w - 28, 29)] });
  const corner = (pos: object, bt: boolean, bl: boolean) => (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: 26, height: 26, borderColor: 'rgba(255,255,255,0.9)', opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }), transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] },
        bt ? { borderTopWidth: 3 } : { borderBottomWidth: 3 },
        bl ? { borderLeftWidth: 3 } : { borderRightWidth: 3 },
        pos,
      ]}
    />
  );
  const label = stage === 'capturing' ? 'Capturing your photo' : stage === 'blending' ? 'Blending the product in' : 'Harmonizing with AI';
  const cardW = Math.min(Math.max(box.w - 36, 250), 340);
  const ORB = 92;
  const HALO = 168;
  const glowText = { textShadowColor: hexToRgba(t.primary, 0.9), textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {blendedUri && <Animated.Image source={{ uri: blendedUri }} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: fade }]} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,8,28,0.2)' }]} />

      {/* drifting aurora light */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -60, top: -40, transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) }] }}>
        <GlowDisc size={Math.max(box.w * 0.9, 240)} color={t.primary} alpha={0.18} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', right: -70, bottom: -50, transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) }] }}>
        <GlowDisc size={Math.max(box.w * 0.9, 240)} color={t.accent} alpha={0.18} />
      </Animated.View>

      {/* viewfinder corners */}
      {corner({ top: 14, left: 14 }, true, true)}
      {corner({ top: 14, right: 14 }, true, false)}
      {corner({ bottom: 14, left: 14 }, false, true)}
      {corner({ bottom: 14, right: 14 }, false, false)}

      {/* scanner: lattice that lights up under the beam, then a layered beam (wide glow, chromatic fringe, laser core, travelling head) */}
      {lattice.rows.map((op, i) => (
        <Animated.View key={i} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: (i + 0.5) * lattice.sy - 2, height: 4, flexDirection: 'row', justifyContent: 'space-around', opacity: op }}>
          {Array.from({ length: lattice.cols }, (_, k) => (
            <View key={k} style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: k % 3 === 0 ? t.accent : '#FFFFFF' }} />
          ))}
        </Animated.View>
      ))}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 0, transform: [{ translateY: beamY }] }}>
        {/* wide soft glow, symmetric so it works in both directions */}
        <LinearGradient colors={['rgba(255,255,255,0)', hexToRgba(t.accent, 0.12), hexToRgba(t.primary, 0.3), hexToRgba(t.accent, 0.12), 'rgba(255,255,255,0)']} locations={[0, 0.3, 0.5, 0.7, 1]} style={{ position: 'absolute', left: 0, right: 0, top: -110, height: 220 }} />
        {/* tight bloom */}
        <LinearGradient colors={['rgba(255,255,255,0)', hexToRgba(t.accent, 0.55), 'rgba(255,255,255,0)']} style={{ position: 'absolute', left: 0, right: 0, top: -14, height: 28 }} />
        {/* chromatic fringe */}
        <LinearGradient colors={['rgba(255,255,255,0)', t.accent, t.accent, 'rgba(255,255,255,0)']} locations={[0, 0.2, 0.8, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', left: 0, right: 0, top: -4.5, height: 1.5, opacity: 0.8 }} />
        <LinearGradient colors={['rgba(255,255,255,0)', t.primary, t.primary, 'rgba(255,255,255,0)']} locations={[0, 0.2, 0.8, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', left: 0, right: 0, top: 3, height: 1.5, opacity: 0.8 }} />
        {/* laser core: bright in the middle, melting away at both ends */}
        <LinearGradient colors={['rgba(255,255,255,0)', '#FFFFFF', '#FFFFFF', 'rgba(255,255,255,0)']} locations={[0, 0.22, 0.78, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', left: 0, right: 0, top: -1.25, height: 2.5, shadowColor: t.accent, shadowOpacity: 1, shadowRadius: 9, shadowOffset: { width: 0, height: 0 } }} />
        {/* end caps */}
        {[10, -10].map((o, i) => (
          <View key={i} style={[{ position: 'absolute', top: -3.5, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff', shadowColor: t.accent, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }, o > 0 ? { left: o } : { right: -o }]} />
        ))}
        {/* scanner head gliding along the beam */}
        <Animated.View style={{ position: 'absolute', left: -32, top: -32, width: 64, height: 64, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: headX }] }}>
          <GlowDisc size={64} color={t.primary} alpha={0.2} />
          <View style={{ width: 11, height: 11, borderRadius: 5.5, backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }} />
        </Animated.View>
      </Animated.View>

      {/* rising sparkles */}
      {box.h > 0 &&
        sparks.map((sp, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: sp.x * Math.max(box.w - 12, 0),
              bottom: 10,
              width: sp.size,
              height: sp.size,
              borderRadius: sp.size,
              backgroundColor: i % 2 ? '#FFFFFF' : t.accent,
              opacity: sp.v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.95, 0.5, 0] }),
              transform: [{ translateY: sp.v.interpolate({ inputRange: [0, 1], outputRange: [0, -(box.h * 0.8)] }) }, { scale: sp.v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.3, 0.4] }) }],
            }}
          />
        ))}

      {/* centre glass card: see-through, with a glowing edge */}
      <View pointerEvents="none" style={{ ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          onLayout={(e) => setCardBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          style={{ width: cardW, opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}
        >
          {/* outer glow: soft halo + stacked rings, breathing */}
          {cardBox.w > 0 && (
            <>
              <Animated.View style={{ position: 'absolute', left: (cardBox.w - cardBox.w * 1.5) / 2, top: (cardBox.h - cardBox.w * 1.5) / 2, width: cardBox.w * 1.5, height: cardBox.w * 1.5, alignItems: 'center', justifyContent: 'center', opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }}>
                <GlowDisc size={cardBox.w * 1.5} color={t.primary} alpha={0.07} />
              </Animated.View>
              {[-22, -13, -6].map((o, i) => (
                <Animated.View key={o} style={{ position: 'absolute', left: o, right: o, top: o, bottom: o, borderRadius: CARD_R - o, backgroundColor: hexToRgba(i === 2 ? t.accent : t.primary, [0.06, 0.09, 0.13][i]), opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }} />
              ))}
            </>
          )}

          {/* the glass itself */}
          <View style={{ borderRadius: CARD_R, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, alignItems: 'center' }}>
            {Platform.OS === 'ios' && <BlurView intensity={14} tint="dark" style={StyleSheet.absoluteFill} />}
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,18,44,0.34)' }]} />
            <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, { height: '55%' }]} />

            {/* orb */}
            <View style={{ width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{ position: 'absolute', left: (ORB - HALO) / 2, top: (ORB - HALO) / 2, width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center', opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }), transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) }] }}>
                <GlowDisc size={HALO} color={t.primary} alpha={0.16} />
              </Animated.View>
              <Animated.View style={{ position: 'absolute', width: ORB, height: ORB, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
                <LinearGradient colors={[t.primary, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', t.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: ORB / 2 }} />
              </Animated.View>
              <Animated.View style={{ width: ORB - 14, height: ORB - 14, borderRadius: (ORB - 14) / 2, backgroundColor: 'rgba(8,12,34,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.04] }) }] }}>
                <Ionicons name={HARMONIZE_STAGES[Math.max(stageIdx, 0)].icon} size={34} color="#fff" />
              </Animated.View>
            </View>

            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 14, letterSpacing: 0.2, textAlign: 'center', ...glowText }}>{label}…</Text>

            {/* stages */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'stretch', marginTop: 16 }}>
              {HARMONIZE_STAGES.map((st, i) => {
                const done = i < stageIdx;
                const active = i === stageIdx;
                return (
                  <React.Fragment key={st.id}>
                    {i > 0 && <View style={{ flex: 1, height: 2.5, borderRadius: 2, marginTop: 16, backgroundColor: i <= stageIdx ? t.accent : 'rgba(255,255,255,0.22)', ...(i <= stageIdx ? { shadowColor: t.accent, shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } } : null) }} />}
                    <View style={{ alignItems: 'center', width: 64 }}>
                      <Animated.View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: done ? hexToRgba(t.accent, 0.22) : active ? hexToRgba(t.primary, 0.55) : 'rgba(255,255,255,0.1)',
                          borderWidth: done || active ? 2 : 1,
                          borderColor: done ? t.accent : active ? '#fff' : 'rgba(255,255,255,0.25)',
                          ...(done || active ? { shadowColor: active ? t.primary : t.accent, shadowOpacity: 0.95, shadowRadius: active ? 12 : 7, shadowOffset: { width: 0, height: 0 } } : null),
                          transform: active ? [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] : undefined,
                        }}
                      >
                        {done ? <Ionicons name="checkmark" size={18} color="#fff" /> : <Ionicons name={st.icon} size={17} color={active ? '#fff' : 'rgba(255,255,255,0.6)'} />}
                      </Animated.View>
                      <Text numberOfLines={1} style={{ color: active || done ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: 11.5, fontWeight: '800', marginTop: 6 }}>{st.label}</Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>

            {/* tip + seconds */}
            <View style={{ alignSelf: 'stretch', alignItems: 'center', marginTop: 14, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }}>
              <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, opacity: tipFade }}>
                <Ionicons name={HARMONIZE_TIP_ICONS[tip % HARMONIZE_TIP_ICONS.length]} size={16} color={t.accent} />
                <Text numberOfLines={1} style={{ color: '#fff', fontSize: 12.5, fontWeight: '700', flexShrink: 1 }}>{HARMONIZE_TIPS[tip]}</Text>
              </Animated.View>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2, fontVariant: ['tabular-nums'] }}>{secs}s</Text>
            </View>
          </View>

          {/* glowing edge: bright rim + a breathing coloured rim + two circling comets */}
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: CARD_R, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' }} />
          <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -1, right: -1, top: -1, bottom: -1, borderRadius: CARD_R + 1, borderWidth: 2.5, borderColor: t.accent, opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.85] }), shadowColor: t.primary, shadowOpacity: 1, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }} />
          {comets.map((c) => (
            <Animated.View
              key={c.key}
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, top: 0, width: c.size, height: c.size, borderRadius: c.size / 2, backgroundColor: '#fff', opacity: c.alpha, shadowColor: t.accent, shadowOpacity: 1, shadowRadius: 9, shadowOffset: { width: 0, height: 0 }, transform: [{ translateX: c.tx }, { translateY: c.ty }] }}
            />
          ))}
        </Animated.View>
      </View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flash }]} />
    </View>
  );
});

/** One animated counter in the credit badge: pops when the value changes. */
const CreditNumber = memo(function CreditNumber({ value, label }: { value: number | null; label: string }) {
  const t = useTheme();
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && value !== null) {
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.4, duration: 140, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
    prev.current = value;
  }, [value, pop]);
  return (
    <View style={{ alignItems: 'center', minWidth: 40 }}>
      <Animated.Text style={{ transform: [{ scale: pop }], color: t.text, fontWeight: '900', fontSize: 17, lineHeight: 20, fontVariant: ['tabular-nums'] }}>
        {value === null ? '–' : value}
      </Animated.Text>
      <Text style={{ color: t.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 }}>{label}</Text>
    </View>
  );
});

/** Header "Credit" chip: gem + today / total balance. Turns amber when nearly out and red at zero. Tap to top up. */
const CreditBadge = memo(function CreditBadge({
  credits,
  syncing,
  offline,
  onPress,
}: {
  credits: Credits | null;
  syncing: boolean;
  offline: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    l.start();
    return () => l.stop();
  }, [glow]);
  const left = credits ? Math.min(credits.daily, credits.total) : null;
  const tone = left === null ? t.primary : left <= 0 ? t.danger : left <= 1 ? t.highlight : t.primary;
  const gemScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Credits. Tap to get more." style={{ alignSelf: 'flex-start', marginTop: 6 }}>
      <LinearGradient
        colors={[hexToRgba(tone, t.dark ? 0.3 : 0.18), hexToRgba(tone, t.dark ? 0.1 : 0.05)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingLeft: 5, paddingRight: 8, borderRadius: 22, borderWidth: 1, borderColor: hexToRgba(tone, 0.5) }}
      >
        <Animated.View style={{ transform: [{ scale: gemScale }] }}>
          <LinearGradient colors={[tone, t.palette[3]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="diamond" size={16} color="#fff" />
          </LinearGradient>
        </Animated.View>
        <CreditNumber value={credits?.daily ?? null} label="TODAY" />
        <View style={{ width: 1, height: 22, backgroundColor: hexToRgba(tone, 0.4) }} />
        <CreditNumber value={credits?.total ?? null} label="TOTAL" />
        {offline && !syncing && <Ionicons name="cloud-offline-outline" size={14} color={t.textMuted} />}
        {syncing ? (
          <ActivityIndicator size="small" color={tone} style={{ width: 22 }} />
        ) : (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: left !== null && left <= 1 ? tone : t.palette[2], alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={16} color="#fff" />
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
});

/** Top-up sheet shown when credits run out (or when the badge is tapped). */
/**
 * Shown instead of the RevenueCat store while the backend flag 'showrevenuecat' is false (the default): a friendly note that the daily credits
 * come back tomorrow, with a live countdown to local midnight and the current balance.
 */
const CreditsResetSheet = memo(function CreditsResetSheet({ visible, credits, onClose }: { visible: boolean; credits: Credits | null; onClose: () => void }) {
  const t = useTheme();
  const bob = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [left, setLeft] = useState(msUntilMidnight());
  const block = credits ? creditBlock(credits) : null;
  useEffect(() => {
    if (!visible) return;
    setLeft(msUntilMidnight());
    const tick = setInterval(() => setLeft(msUntilMidnight()), 30000);
    const l1 = Animated.loop(Animated.sequence([Animated.timing(bob, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(bob, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    const l2 = Animated.loop(Animated.timing(glow, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    l1.start();
    l2.start();
    return () => {
      clearInterval(tick);
      l1.stop();
      l2.stop();
    };
  }, [visible, bob, glow]);
  const title = block === 'daily' ? "You've used today's free credits" : block === 'total' ? "You're out of credits" : 'Your credits';
  const body =
    block === 'daily'
      ? 'Your daily credits reset tomorrow, so come back then to create more scenes. Nothing you made is lost.'
      : block === 'total'
        ? 'All of your credits have been used. Top-ups are not available yet, and we will let you know when they are.'
        : 'A Standard scene or a harmonize uses 1 credit, an Advanced scene uses 2. Your daily credits refresh every day at midnight.';
  const stat = (label: string, value: string, sub: string, color: string) => (
    <View style={{ flex: 1, padding: 14, borderRadius: 18, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
      <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>{label}</Text>
      <Text style={{ color, fontSize: 28, fontWeight: '900', marginTop: 2 }}>{value}</Text>
      <Text style={{ color: t.textMuted, fontSize: 11.5 }}>{sub}</Text>
    </View>
  );
  return (
    <SheetModal visible={visible} title="Credits" onClose={onClose}>
      {/* the content scrolls if the screen is short; the "Got it" button below always stays visible */}
      <ScrollView showsVerticalScrollIndicator={false} bounces={false} style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
      <View style={{ alignItems: 'center', paddingTop: 0, paddingBottom: 6 }}>
        <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={{ position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: hexToRgba(t.primary, 0.25), opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }} />
          <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] }) }] }}>
            <LinearGradient colors={block ? ['#6C63FF', '#2B2A6B'] : t.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', ...elevation(3, t.primary) }}>
              <Ionicons name={block ? 'moon' : 'sparkles'} size={38} color="#fff" />
            </LinearGradient>
          </Animated.View>
        </View>
        <Text style={{ color: t.text, ...TYPE.headline, textAlign: 'center', marginTop: 4 }}>{title}</Text>
        <Text style={{ color: t.textMuted, fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 330 }}>{body}</Text>
        {block !== 'total' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: hexToRgba(t.primary, 0.12) }}>
            <Ionicons name="time-outline" size={16} color={t.primary} />
            <Text style={{ color: t.primary, fontWeight: '800', fontSize: 13.5 }}>Resets in {formatCountdown(left)}</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
        {stat('DAILY', credits ? String(credits.daily) : '–', `of ${dailyAllowance()} today`, credits && credits.daily <= 0 ? '#E5484D' : t.primary)}
        {stat('TOTAL', credits ? String(credits.total) : '–', 'credits in your balance', credits && credits.total <= 0 ? '#E5484D' : t.text)}
      </View>
      </ScrollView>
      <Pressable onPress={onClose} accessibilityRole="button" style={{ marginTop: 14, marginBottom: 4 }}>
        <LinearGradient colors={t.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', ...elevation(2, t.cta[0]) }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Got it</Text>
        </LinearGradient>
      </Pressable>
    </SheetModal>
  );
});

const CreditsModal = memo(function CreditsModal({
  visible,
  credits,
  packs,
  loadingPacks,
  purchasing,
  error,
  mock,
  onClose,
  onBuy,
  onRestore,
  onRetry,
}: {
  visible: boolean;
  credits: Credits | null;
  packs: CreditPack[];
  loadingPacks: boolean;
  purchasing: boolean;
  error: string | null;
  mock: boolean;
  onClose: () => void;
  onBuy: (pack: CreditPack) => void;
  onRestore: () => void;
  onRetry: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState<string | null>(null);
  const ring = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const block = credits ? creditBlock(credits) : null;

  useEffect(() => {
    if (!visible) return;
    const l1 = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    const l2 = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    l1.start();
    l2.start();
    return () => {
      l1.stop();
      l2.stop();
      ring.setValue(0);
      bob.setValue(0);
    };
  }, [visible, ring, bob]);

  useEffect(() => {
    if (packs.length === 0) return;
    setSel((cur) => (cur && packs.some((p) => p.id === cur) ? cur : (packs.find((p) => p.badge) ?? packs[0]).id));
  }, [packs]);

  const chosen = packs.find((p) => p.id === sel) ?? null;
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  const floatY = bob.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] });
  const close = () => {
    if (!purchasing) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,4,14,0.74)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <LinearGradient
          colors={['#1F1745', '#2B1B57', '#120F26']}
          style={{ borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}
        >
          <Pressable onPress={close} hitSlop={10} style={{ position: 'absolute', right: 16, top: 16, zIndex: 2, opacity: purchasing ? 0.4 : 1 }}>
            <Ionicons name="close-circle" size={30} color="rgba(255,255,255,0.65)" />
          </Pressable>

          <View style={{ alignItems: 'center', height: 124, justifyContent: 'center' }}>
            <Animated.View style={{ position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: '#B7A6FF', opacity: ringOpacity, transform: [{ scale: ringScale }] }} />
            <View style={{ position: 'absolute', width: 118, height: 118, borderRadius: 59, backgroundColor: 'rgba(140,110,255,0.16)' }} />
            <Animated.View style={{ transform: [{ translateY: floatY }], shadowColor: '#9D8CFF', shadowOpacity: 0.9, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } }}>
              <LinearGradient colors={['#A99BFF', '#FF77C0', '#FFB56B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)' }}>
                <Ionicons name="diamond" size={42} color="#fff" />
              </LinearGradient>
            </Animated.View>
          </View>

          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 4 }}>{block === 'daily' ? "Today's credits are used" : block === 'total' ? "You're out of credits" : 'Get more credits'}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
            {block === 'daily'
              ? 'Your daily credits renew tomorrow, or top up now to keep creating.'
              : block === 'total'
                ? 'Top up to keep creating.'
                : 'Generate 3D Scene and Harmonize use 1 credit each (2 for an Advanced scene), from your daily and total credits.'}
          </Text>

          {credits && (
            <View style={{ flexDirection: 'row', alignSelf: 'center', gap: 8, marginTop: 12 }}>
              {[
                ['Today', credits.daily],
                ['Total', credits.total],
              ].map(([label, n]) => (
                <View key={String(label)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.09)' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' }}>{label}</Text>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{n}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ marginTop: 16, minHeight: 90 }}>
            {loadingPacks ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', height: 90 }}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : packs.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', height: 90, gap: 8 }}>
                <Text style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>{error ?? 'No credit packs available.'}</Text>
                <Pressable onPress={onRetry} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)' }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Try Again</Text>
                </Pressable>
              </View>
            ) : (
              packs.map((p) => {
                const on = p.id === sel;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => !purchasing && setSel(p.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, marginBottom: 10, backgroundColor: on ? 'rgba(140,116,255,0.24)' : 'rgba(255,255,255,0.06)', borderWidth: on ? 1.5 : 1, borderColor: on ? '#A99BFF' : 'rgba(255,255,255,0.12)' }}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? '#A99BFF' : 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#A99BFF' }} />}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>{p.credits} credits</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{p.title}</Text>
                    </View>
                    {p.badge && (
                      <LinearGradient colors={['#FF77C0', '#FFB56B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 10 }}>
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }}>{p.badge}</Text>
                      </LinearGradient>
                    )}
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>{p.priceLabel}</Text>
                  </Pressable>
                );
              })
            )}
          </View>

          {error && packs.length > 0 && <Text style={{ color: '#FF8FA3', fontSize: 12, textAlign: 'center', marginBottom: 8 }}>{error}</Text>}

          <Pressable onPress={() => chosen && onBuy(chosen)} disabled={!chosen || purchasing} style={{ opacity: !chosen || purchasing ? 0.7 : 1 }}>
            <LinearGradient colors={['#7C6CFF', '#FF6FB5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {purchasing && <ActivityIndicator color="#fff" />}
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>{purchasing ? 'Processing…' : chosen ? `Continue · ${chosen.priceLabel}` : 'Continue'}</Text>
            </LinearGradient>
          </Pressable>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 14 }}>
            <Pressable onPress={onRestore} disabled={purchasing}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 13 }}>Restore purchases</Text>
            </Pressable>
            <Pressable onPress={close} disabled={purchasing}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 13 }}>Not now</Text>
            </Pressable>
          </View>
          {mock && <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'center', marginTop: 10 }}>Mock store (Expo Go): no real purchase or charge.</Text>}
        </LinearGradient>
      </View>
    </Modal>
  );
});

type ScenePreviewStatus = 'loading' | 'ready' | 'error';

/**
 * Sandboxed host for cloud-generated Three.js HTML. The page can only talk to us through
 * typed JSON messages (ready / error); it never gets React Native APIs, files or navigation.
 */
const ScenePreview = memo(function ScenePreview({
  html,
  asset,
  playing,
  hd,
  reloadKey,
  onStatus,
}: {
  html: string;
  asset: ProductAsset;
  playing: boolean;
  hd: boolean;
  reloadKey: number;
  onStatus: (s: ScenePreviewStatus, detail?: string) => void;
}) {
  const t = useTheme();
  const webRef = useRef<WebView>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const readyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  // Stable emitter: the parent's callback identity changes while typing and must not reload the page.
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const emit = useCallback((s: ScenePreviewStatus, d?: string) => statusRef.current(s, d), []);

  // Rebuilt only when the page, product or quality changes - never on typing or play/pause.
  const [payload, setPayload] = useState<ReturnType<typeof buildProductPayload> | null>(null);
  useEffect(() => {
    let alive = true;
    setPayload(null);
    buildProductPayloadAsync(asset, hd)
      .then((p) => alive && setPayload(p))
      .catch(() => alive && setPayload(buildProductPayload(asset, hd)));
    return () => {
      alive = false;
    };
  }, [asset, hd]);
  // Post processing: only pages made with the newer cookbook understand the flag. For older html the payload stays exactly as before,
  // so toggling the setting never reloads them and they render as they always did.
  const postFx = usePostFxSettings();
  const postCapable = useMemo(() => html.includes(POST_FX_PAGE_MARKER), [html]);
  const postOn = postCapable && postFx.enabled;
  const postOffKey = postFx.off.join(',');
  const doc = useMemo(
    () => (payload ? buildPreviewHtml(html, postCapable ? { ...payload, post: postOn, postFxOff: postOffKey ? postOffKey.split(',') : [] } : payload) : ''),
    [html, payload, postCapable, postOn, postOffKey],
  );

  const sendPaused = useCallback((p: boolean) => {
    webRef.current?.injectJavaScript(`window.__M3D_setPaused&&window.__M3D_setPaused(${p ? 'true' : 'false'});true;`);
  }, []);
  // While recording, the page hides its own controls (the FX pill) so they are not in the video.
  const recordingUi = useSceneRecording();
  const recordingUiRef = useRef(recordingUi);
  recordingUiRef.current = recordingUi;
  const sendRecording = useCallback((on: boolean) => {
    webRef.current?.injectJavaScript(`window.__M3D_setRecording&&window.__M3D_setRecording(${on ? 'true' : 'false'});true;`);
  }, []);
  useEffect(() => {
    sendRecording(recordingUi);
  }, [recordingUi, sendRecording]);
  useEffect(() => {
    sendPaused(!playing);
  }, [playing, sendPaused]);

  useEffect(() => {
    readyRef.current = false;
    setLoading(true);
    emit('loading');
    // The CDN may be unreachable (offline Expo Go): fail with a friendly message instead of a blank view.
    const timer = setTimeout(() => {
      if (!readyRef.current) {
        setLoading(false);
        emit('error', 'timeout waiting for the 3D scene');
      }
    }, SCENE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [doc, reloadKey, emit]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ready') {
        readyRef.current = true;
        setLoading(false);
        emit('ready');
        sendPaused(!playingRef.current);
        sendRecording(recordingUiRef.current);
      } else if (msg.type === 'error') {
        const text = String(msg.message ?? '').slice(0, 300);
        console.error('[Magic3DStudio] scene page error:', text);
        if (msg.fatal === true && !readyRef.current) {
          setLoading(false);
          emit('error', text);
        }
      }
    },
    [emit, sendPaused, sendRecording],
  );

  const allowRequest = useCallback(
    (req: { url: string }) =>
      req.url.startsWith(SCENE_BASE_URL) || req.url.startsWith('about:') || req.url.startsWith('data:') || req.url.startsWith('blob:'),
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      {!!doc && <WebView
        key={`scene-${reloadKey}`}
        ref={webRef}
        source={{ html: doc, baseUrl: SCENE_BASE_URL }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={allowRequest}
        onError={(e) => {
          console.error('[Magic3DStudio] WebView error', e.nativeEvent);
          setLoading(false);
          emit('error', String(e.nativeEvent?.description ?? 'load failed'));
        }}
        onHttpError={(e) => console.error('[Magic3DStudio] WebView http error', e.nativeEvent.statusCode)}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsInlineMediaPlayback
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        androidLayerType="hardware"
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />}
      {loading && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: t.stageBg[0] }]}>
          <ActivityIndicator color={t.primary} />
          <Text style={{ color: t.textMuted, marginTop: 8, fontWeight: '600', fontSize: 12 }}>Loading 3D scene…</Text>
        </View>
      )}
    </View>
  );
});

/** Preview-canvas message when the 3D page could not be downloaded in time. */
const SceneUnavailable = memo(function SceneUnavailable({ onRetry, onOffline }: { onRetry: () => void; onOffline: () => void }) {
  const t = useTheme();
  return (
    <LinearGradient colors={t.stageBg} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: SP.xl }]}>
      <View style={{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#E5484D', 0.12), marginBottom: SP.lg }}>
        <View style={{ width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba('#E5484D', 0.16) }}>
          <Ionicons name="cloud-offline-outline" size={34} color="#E5484D" />
        </View>
      </View>
      <Text style={{ color: t.text, ...TYPE.headline, textAlign: 'center' }}>3D scene not available</Text>
      <Text style={{ color: t.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: SP.sm, maxWidth: 300 }}>
        We could not get your 3D scene in time. Your product images are safe. Try again, or use the offline preview.
      </Text>
      <View style={{ flexDirection: 'row', gap: SP.md, marginTop: SP.xl }}>
        <Pressable onPress={() => { haptic.tap(); onRetry(); }} accessibilityRole="button" style={{ minHeight: TOUCH_MIN, paddingHorizontal: SP.xl, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.primary }}>
          <Ionicons name="refresh" size={17} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => { haptic.tap(); onOffline(); }} accessibilityRole="button" style={{ minHeight: TOUCH_MIN, paddingHorizontal: SP.lg, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: hexToRgba(t.primary, 0.5), backgroundColor: t.surface }}>
          <Ionicons name="cube-outline" size={17} color={t.primary} />
          <Text style={{ color: t.primary, fontWeight: '800', fontSize: 14 }}>Offline preview</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
});

const BUILD_MESSAGES = ['Placing your product in the scene', 'Setting up lights and camera', 'Adding motion and depth', 'Polishing the final frames'];

/** A soft round glow: stacked translucent discs fake a feathered edge (no blur needed, native-driver friendly). */
const GlowDisc = ({ size, color, alpha }: { size: number; color: string; alpha: number }) => (
  <>
    {[1, 0.78, 0.56, 0.36].map((k, i) => (
      <View key={i} style={{ position: 'absolute', width: size * k, height: size * k, borderRadius: (size * k) / 2, backgroundColor: hexToRgba(color, alpha) }} />
    ))}
  </>
);

/** Orbiting sparkles: radius, full turns per loop (negative = counter-clockwise), start angle, size, colour slot. */
const BUILD_SPARKS = [
  { r: 74, k: 1, a: 0, s: 6, c: 0 },
  { r: 74, k: 1, a: 180, s: 4, c: 3 },
  { r: 96, k: -2, a: 60, s: 5, c: 1 },
  { r: 96, k: -2, a: 240, s: 3.5, c: 5 },
  { r: 112, k: 1, a: 120, s: 4, c: 2 },
  { r: 112, k: 1, a: 300, s: 6, c: 4 },
  { r: 58, k: -3, a: 30, s: 3.5, c: 5 },
  { r: 58, k: -3, a: 210, s: 3, c: 3 },
] as const;

/**
 * Before / after compare of two 3D pages (the page before a Retouch and the retouched one), both live in the canvas:
 * "before" fills the canvas, "after" is clipped to the right of a draggable divider. Only the divider handle takes the
 * finger, so orbiting / tapping inside either WebView still works. Two WebGL pages are heavier than one: it is opt-in.
 */
const CompareScenes = memo(function CompareScenes({ before, after, asset, playing, hd, reloadKey, onStatus, reveal, topInset = 0 }: { topInset?: number; before: string; after: string; asset: ProductAsset; playing: boolean; hd: boolean; reloadKey: number; onStatus: (s: ScenePreviewStatus, detail?: string) => void; /** play the light-curtain reveal (right after a Retouch) */ reveal?: boolean }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const [split, setSplit] = useState(0.5);
  const splitRef = useRef(0.5);
  const startRef = useRef(0.5);
  const wRef = useRef(0);
  wRef.current = w;
  const [revealing, setRevealing] = useState(!!reveal);
  const glow = useRef(new Animated.Value(reveal ? 1 : 0)).current;
  // "Reveal wipe": the before page is on screen, a glowing curtain sweeps across it and the retouched page appears behind it.
  useEffect(() => {
    if (!reveal) return;
    const sweep = new Animated.Value(0.96);
    splitRef.current = 0.96;
    setSplit(0.96);
    setRevealing(true);
    glow.setValue(1);
    haptic.tap();
    const id = sweep.addListener(({ value }) => {
      splitRef.current = value;
      setSplit(value);
    });
    const anim = Animated.sequence([
      Animated.delay(250),
      Animated.timing(sweep, { toValue: 0.5, duration: 1700, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    ]);
    anim.start(({ finished }) => {
      if (!finished) return;
      haptic.success();
      Animated.timing(glow, { toValue: 0, duration: 700, useNativeDriver: true }).start(() => setRevealing(false));
    });
    return () => {
      anim.stop();
      sweep.removeListener(id);
    };
  }, [reveal, glow]);
  const hint = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([Animated.timing(hint, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(hint, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    l.start();
    return () => l.stop();
  }, [hint]);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startRef.current = splitRef.current;
          haptic.select();
        },
        onPanResponderMove: (_, g) => {
          const v = clamp(startRef.current + g.dx / Math.max(wRef.current, 1), 0.06, 0.94);
          splitRef.current = v;
          setSplit(v);
        },
      }),
    [],
  );
  const noop = useCallback(() => {}, []);
  const chip = (label: string, side: 'left' | 'right', accent: boolean) => (
    <View pointerEvents="none" style={{ position: 'absolute', top: 48 + topInset, [side]: 10, paddingHorizontal: 10, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: accent ? hexToRgba(t.primary, 0.92) : 'rgba(14,16,26,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
      <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8 }}>{label}</Text>
    </View>
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      <ScenePreview html={before} asset={asset} playing={playing} hd={hd} reloadKey={reloadKey} onStatus={noop} />
      {w > 0 && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: Math.max(0, w * (1 - split)), overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: w }}>
            <ScenePreview html={after} asset={asset} playing={playing} hd={hd} reloadKey={reloadKey} onStatus={onStatus} />
          </View>
        </View>
      )}
      {chip('BEFORE', 'left', false)}
      {chip('AFTER', 'right', true)}
      {revealing && w > 0 && (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: w * split - 70, width: 140, opacity: glow }}>
          <LinearGradient colors={['rgba(255,255,255,0)', hexToRgba(t.accent, 0.55), 'rgba(255,255,255,0.85)', hexToRgba(t.primary, 0.55), 'rgba(255,255,255,0)']} locations={[0, 0.35, 0.5, 0.65, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </Animated.View>
      )}
      {w > 0 && (
        <View {...pan.panHandlers} style={{ position: 'absolute', top: 0, bottom: 0, left: w * split - 24, width: 48, alignItems: 'center', justifyContent: 'center' }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: 'rgba(255,255,255,0.95)', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
          <Animated.View pointerEvents="none" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary, borderWidth: 2.5, borderColor: '#fff', ...elevation(4, '#000'), transform: [{ scale: hint.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }}>
            <Ionicons name="swap-horizontal" size={20} color="#fff" />
          </Animated.View>
        </View>
      )}
    </View>
  );
});

/** Retouch history of a scene: Original -> Retouch 1 -> Retouch 2 ... Tap a version to load it; "Before / After" then compares it with the one before. */
const VersionTimeline = memo(function VersionTimeline({ versions, activeIdx, onSelect }: { versions: SceneVersion[]; activeIdx: number; onSelect: (i: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: SP.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="git-branch-outline" size={15} color={t.palette[4]} />
        <Text style={{ color: t.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 }}>VERSIONS</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 2, alignItems: 'center' }}>
        {versions.map((v, i) => {
          const active = i === activeIdx;
          return (
            <React.Fragment key={`${i}-${v.label}`}>
              {i > 0 && <Ionicons name="chevron-forward" size={14} color={t.textMuted} style={{ marginHorizontal: 5, marginBottom: 16 }} />}
              <Pressable onPress={() => onSelect(i)} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${v.label} version`} style={{ alignItems: 'center', width: 70 }}>
                <View style={{ width: 62, height: 62, borderRadius: 18, overflow: 'hidden', borderWidth: active ? 3 : 1, borderColor: active ? t.primary : t.border, backgroundColor: t.stageBg[0], ...(active ? elevation(3, t.primary) : null) }}>
                  {v.thumb ? <Image source={{ uri: v.thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="cube-outline" size={22} color={t.textMuted} /></View>}
                  {i > 0 && (
                    <View style={{ position: 'absolute', right: 3, bottom: 3, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary }}>
                      <Ionicons name="sparkles" size={11} color="#fff" />
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} style={{ color: active ? t.primary : t.textMuted, fontSize: 11, fontWeight: active ? '900' : '700', marginTop: 5 }}>{v.label}</Text>
              </Pressable>
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
});

type RetouchStage = 'uploading' | 'retouching';
const RETOUCH_MESSAGES = ['Reading your 3D scene', 'Refining lights and materials', 'Sharpening the fine details', 'Balancing colour and depth', 'Polishing the final frames'];
const RETOUCH_STEPS: { id: RetouchStage | 'ready'; label: string; icon: IconName }[] = [
  { id: 'uploading', label: 'Send', icon: 'cloud-upload-outline' },
  { id: 'retouching', label: 'Retouch', icon: 'sparkles-outline' },
  { id: 'ready', label: 'Load', icon: 'cube-outline' },
];

/**
 * Preview-canvas animation while a Retouch runs in the cloud. It fills only the 3D canvas, so the rest of the screen
 * (platform images, product views, settings...) stays fully usable. A "before" frame of the scene is touched up by a
 * sweeping light beam and drifting sparkles, inside a rotating ring, with the three stages and a seconds counter.
 */
const RetouchBuilding = memo(function RetouchBuilding({ uri, stage }: { uri?: string; stage: RetouchStage }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const beam = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const msgFade = useRef(new Animated.Value(1)).current;
  const sparks = useRef(
    Array.from({ length: 14 }, (_, i) => ({ v: new Animated.Value(0), x: ((i * 41 + 7) % 100) / 100, size: 3 + (i % 3) * 2, delay: (i * 270) % 2600, dur: 2600 + (i % 4) * 500 })),
  ).current;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [msg, setMsg] = useState(0);
  const [secs, setSecs] = useState(0);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => setImgOk(true), [uri]);

  useEffect(() => {
    if (reduce) return;
    const sine = (v: Animated.Value, ms: number) =>
      Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4200, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.sequence([Animated.timing(beam, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.delay(500), Animated.timing(beam, { toValue: 0, duration: 0, useNativeDriver: true })])),
      sine(breathe, 1300),
      sine(drift, 4600),
      ...sparks.map((sp) => Animated.loop(Animated.sequence([Animated.delay(sp.delay), Animated.timing(sp.v, { toValue: 1, duration: sp.dur, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(sp.v, { toValue: 0, duration: 0, useNativeDriver: true })]))),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [spin, beam, breathe, drift, sparks, reduce]);

  useEffect(() => {
    const tick = setInterval(() => setSecs((n) => n + 1), 1000);
    const swap = setInterval(() => {
      Animated.timing(msgFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setMsg((n) => (n + 1) % RETOUCH_MESSAGES.length);
        Animated.timing(msgFade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, 3000);
    return () => {
      clearInterval(tick);
      clearInterval(swap);
    };
  }, [msgFade]);

  const FRAME = box.h > 0 ? Math.max(84, Math.min(170, Math.round(box.h - 330))) : 150;
  const stageIdx = RETOUCH_STEPS.findIndex((x) => x.id === stage);
  const showImg = !!uri && imgOk;
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 40, backgroundColor: 'rgba(8,10,22,0.96)' }]}>
      {showImg && <Image source={{ uri }} blurRadius={Platform.OS === 'android' ? 40 : 30} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: 0.3 }]} />}
      <LinearGradient pointerEvents="none" colors={[hexToRgba(t.primary, 0.4), 'rgba(8,10,22,0)', hexToRgba(t.accent, 0.34)]} style={StyleSheet.absoluteFill} />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -50, top: -30, transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 60] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) }] }}>
        <GlowDisc size={Math.max(box.w * 0.9, 240)} color={t.primary} alpha={0.18} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', right: -60, bottom: -40, transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) }] }}>
        <GlowDisc size={Math.max(box.w * 0.9, 240)} color={t.accent} alpha={0.18} />
      </Animated.View>

      {/* rising sparkles */}
      {box.h > 0 &&
        sparks.map((sp, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: sp.x * Math.max(box.w - 12, 0),
              bottom: 16,
              width: sp.size,
              height: sp.size,
              borderRadius: sp.size,
              backgroundColor: i % 2 ? '#FFFFFF' : t.accent,
              opacity: sp.v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.95, 0.5, 0] }),
              transform: [{ translateY: sp.v.interpolate({ inputRange: [0, 1], outputRange: [0, -(box.h * 0.85)] }) }, { scale: sp.v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.3, 0.4] }) }],
            }}
          />
        ))}

      {/* the scene being touched up */}
      <View style={{ width: FRAME + 40, height: FRAME + 40, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: FRAME + 34, height: FRAME + 34, transform: [{ rotate: rot }] }}>
          <LinearGradient colors={[t.primary, 'rgba(255,255,255,0)', t.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 36 }} />
        </Animated.View>
        <Animated.View
          style={{
            width: FRAME,
            height: FRAME,
            borderRadius: 26,
            overflow: 'hidden',
            backgroundColor: '#1a1f33',
            borderWidth: 3,
            borderColor: 'rgba(255,255,255,0.9)',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }) }],
          }}
        >
          {showImg ? <Image source={{ uri }} onError={() => setImgOk(false)} style={{ width: FRAME, height: FRAME }} resizeMode="cover" /> : <CubeIcon size={44} color="rgba(255,255,255,0.9)" strokeWidth={1.8} />}
          {/* light beam that "retouches" the frame */}
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -24, bottom: -24, width: 60, transform: [{ translateX: beam.interpolate({ inputRange: [0, 1], outputRange: [-90, FRAME + 40] }) }, { rotate: '18deg' }] }}>
            <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>
        </Animated.View>
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 6, right: 4, transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] }) }, { rotate: breathe.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '12deg'] }) }] }}>
          <Ionicons name="sparkles" size={26} color="#fff" />
        </Animated.View>
      </View>

      <Text numberOfLines={1} style={{ color: '#fff', fontSize: 17, fontWeight: '900', marginTop: 12, textAlign: 'center' }}>{stage === 'uploading' ? 'Sending your scene' : 'Retouching your scene'}…</Text>

      {/* stages */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        {RETOUCH_STEPS.map((st, i) => {
          const done = i < stageIdx;
          const active = i === stageIdx;
          return (
            <React.Fragment key={st.id}>
              {i > 0 && <View style={{ width: 24, height: 2, borderRadius: 1, backgroundColor: done || active ? t.accent : 'rgba(255,255,255,0.25)' }} />}
              <View style={{ alignItems: 'center', width: 58 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? t.accent : active ? t.primary : 'rgba(255,255,255,0.14)', borderWidth: active ? 2 : 0, borderColor: '#fff' }}>
                  {done ? <Ionicons name="checkmark" size={15} color="#fff" /> : <Ionicons name={st.icon} size={14} color="#fff" />}
                </View>
                <Text style={{ color: active || done ? '#fff' : 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '800', marginTop: 4 }}>{st.label}</Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      <Animated.Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '600', marginTop: 12, opacity: msgFade }}>
        {RETOUCH_MESSAGES[msg]}
      </Animated.Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] }}>{secs}s · you can keep using the app</Text>
    </View>
  );
});

/** Preview-canvas animation while the cloud builds the 3D page: an aurora, a floating product and orbiting light. */
const SceneBuilding = memo(function SceneBuilding({ uri, images, ready, total }: { uri: string; /** pictures to cycle through in the floating spot (falls back to `uri`) */ images?: string[]; ready: number; total: number }) {
  const t = useTheme();
  const spin = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const reduce = useReduceMotion();
  const [msg, setMsg] = useState(0);
  // the floating picture: a small carousel (cross-fade) through the images that are ready, or the generic progress images
  const rawPics = images && images.length ? images : [uri];
  // Every picture is re-rendered by Skia on a transparent canvas (PNG data URI) so the cut-out never shows a black box; the raw uri is used until it is ready.
  const [cleanPics, setCleanPics] = useState<Record<string, string>>({});
  const rawKey = rawPics.join('|');
  useEffect(() => {
    let alive = true;
    rawPics.forEach((u) => {
      if (!u || u.startsWith('data:image/png')) return; // already a PNG data URI
      toTransparentPngUri(u)
        .then((d) => alive && setCleanPics((m) => (m[u] === d ? m : { ...m, [u]: d })))
        .catch((e) => console.warn('[Magic3DStudio] overlay picture kept as is', e));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawKey]);
  const pics = rawPics.map((u) => cleanPics[u] ?? u);
  const [picIdx, setPicIdx] = useState(0);
  const picFade = useRef(new Animated.Value(1)).current;
  const picKey = rawKey;
  useEffect(() => {
    setPicIdx(0);
    if (pics.length < 2) return;
    const id = setInterval(() => {
      Animated.timing(picFade, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
        setPicIdx((i) => (i + 1) % pics.length);
        Animated.timing(picFade, { toValue: 1, duration: 340, useNativeDriver: true }).start();
      });
    }, 2600);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picKey, picFade]);
  useEffect(() => {
    if (reduce) return;
    const sine = (v: Animated.Value, ms: number) => Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true })),
      sine(bob, 1900),
      sine(pulse, 2300),
      sine(drift, 5200),
      sine(twinkle, 900),
    ];
    loops.forEach((l) => l.start());
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setMsg((m) => (m + 1) % BUILD_MESSAGES.length);
        Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, 2800);
    return () => {
      loops.forEach((l) => l.stop());
      clearInterval(id);
    };
  }, [spin, bob, pulse, drift, twinkle, fade, reduce]);
  const turns = (k: number, a = 0) => spin.interpolate({ inputRange: [0, 1], outputRange: [`${a}deg`, `${a + 360 * k}deg`] });
  const palette = [t.palette[0], t.palette[1], t.palette[2], t.palette[3], t.palette[4], t.highlight];
  const BOX = 250;
  const HEAD_R = 88;
  return (
    <LinearGradient colors={t.stageBg} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}>
      {/* aurora: three slow, drifting colour clouds */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -70, left: -80, width: 300, height: 300, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 50] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) }] }}>
        <GlowDisc size={300} color={t.primary} alpha={0.09} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: -90, right: -90, width: 320, height: 320, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -45] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -25] }) }] }}>
        <GlowDisc size={320} color={t.palette[1]} alpha={0.12} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: '38%', right: -60, width: 200, height: 200, alignItems: 'center', justifyContent: 'center', opacity: drift.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }}>
        <GlowDisc size={200} color={t.palette[3]} alpha={0.1} />
      </Animated.View>

      <View style={{ width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' }}>
        {/* breathing halo behind the product */}
        <Animated.View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center', opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.1] }) }] }}>
          <GlowDisc size={190} color={t.palette[2]} alpha={0.11} />
        </Animated.View>

        {/* thin guide rings */}
        <View style={{ position: 'absolute', width: 176, height: 176, borderRadius: 88, borderWidth: 1, borderColor: hexToRgba(t.palette[2], 0.3) }} />
        <View style={{ position: 'absolute', width: 224, height: 224, borderRadius: 112, borderWidth: 1, borderColor: hexToRgba(t.palette[3], 0.28), borderStyle: 'dashed' }} />

        {/* comet: a bright head with a fading tail circling the product */}
        <Animated.View style={{ position: 'absolute', width: HEAD_R * 2, height: HEAD_R * 2, transform: [{ rotate: turns(1) }] }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => {
            const ang = (-n * 8 * Math.PI) / 180 - Math.PI / 2;
            const sz = 11 - n * 1.15;
            return <View key={n} style={{ position: 'absolute', left: HEAD_R + Math.cos(ang) * HEAD_R - sz / 2, top: HEAD_R + Math.sin(ang) * HEAD_R - sz / 2, width: sz, height: sz, borderRadius: sz / 2, backgroundColor: mixHex(t.primary, t.palette[3], n / 7), opacity: 1 - n * 0.12, ...(n === 0 ? { shadowColor: t.primary, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } } : null) }} />;
          })}
        </Animated.View>

        {/* sparkles on several orbits, twinkling in turn */}
        {BUILD_SPARKS.map((sp, i) => (
          <Animated.View key={i} pointerEvents="none" style={{ position: 'absolute', width: sp.r * 2, height: sp.r * 2, transform: [{ rotate: turns(sp.k, sp.a) }] }}>
            <Animated.View style={{ position: 'absolute', left: sp.r - sp.s / 2, top: -sp.s / 2, width: sp.s, height: sp.s, borderRadius: sp.s / 2, backgroundColor: palette[sp.c], opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [0.25, 1] : [1, 0.25] }) }} />
          </Animated.View>
        ))}

        {/* floating product with a soft ground shadow that breathes with the bob */}
        <Animated.View style={{ position: 'absolute', bottom: 46, width: 92, height: 14, borderRadius: 46, backgroundColor: 'rgba(0,0,0,0.14)', opacity: bob.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.45] }), transform: [{ scaleX: bob.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }] }} />
        <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [8, -10] }) }, { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ['-2.5deg', '2.5deg'] }) }] }}>
          <Animated.Image source={{ uri: pics[picIdx % pics.length] }} style={{ width: 116, height: 116, opacity: picFade, backgroundColor: 'transparent' }} resizeMode="contain" fadeDuration={0} />
        </Animated.View>
      </View>

      <Animated.View style={{ alignItems: 'center', opacity: fade, marginTop: 6 }}>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 17, letterSpacing: 0.2 }}>Building your 3D scene</Text>
        <Text style={{ color: t.textMuted, fontSize: 12.5, marginTop: 4 }}>{BUILD_MESSAGES[msg]}…</Text>
      </Animated.View>
      {total > 0 && (
        <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: hexToRgba(t.primary, 0.1), borderWidth: 1, borderColor: hexToRgba(t.primary, 0.18) }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: total }).map((_, n) => (
              <View key={n} style={{ width: n < ready ? 14 : 6, height: 6, borderRadius: 3, backgroundColor: n < ready ? t.palette[n % 6] : hexToRgba(t.palette[n % 6], 0.28) }} />
            ))}
          </View>
          <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12 }}>
            {ready} of {total} images ready
          </Text>
        </View>
      )}
      <Text style={{ color: t.textMuted, fontSize: 11.5, marginTop: 10 }}>You can keep using the app meanwhile</Text>
    </LinearGradient>
  );
});

const Stage = memo(function Stage({
  asset,
  scene,
  mode,
  playing,
  hd,
  sceneHtml,
  scenePending,
  sceneUnavailable,
  onRetryScene,
  onOfflineScene,
  readyCount,
  totalCount,
  retouchStage,
  retouchUri,
  progressImages,
  beforeHtml,
  compareOn,
  revealCompare,
  onToggleCompare,
  onExitCompare,
  filmRenderer,
  reloadKey,
  onSceneStatus,
  capture,
  user,
  view,
  topInset = 0,
  exitCompareBottom = 17,
  exitCompareLeft = 12,
  hideExitCompare = false,
}: {
  /** "Exit compare" sits at the bottom left, level with the record button: its distance from the bottom / left edge */
  exitCompareBottom?: number;
  exitCompareLeft?: number;
  /** true while recording: the button would sit on the recording indicator */
  hideExitCompare?: boolean;
  /** extra space above the compare controls (fullscreen: keeps them clear of the Film Studio pill and the pause / close icons) */
  topInset?: number;
  asset: ProductAsset | null;
  scene: SceneSpec;
  mode: 'film' | 'camera';
  playing: boolean;
  hd: boolean;
  sceneHtml: string | null;
  scenePending: boolean;
  sceneUnavailable: boolean;
  onRetryScene: () => void;
  onOfflineScene: () => void;
  readyCount: number;
  totalCount: number;
  retouchStage: RetouchStage | null;
  retouchUri?: string;
  /** the page before a Retouch: when set, the preview can compare it with the retouched page */
  /** pictures for the 'Building your 3D scene' carousel */
  progressImages?: string[];
  beforeHtml?: string | null;
  compareOn: boolean;
  revealCompare?: boolean;
  onToggleCompare: () => void;
  /** leaves the compare view and shows the new (retouched) page on its own */
  onExitCompare: () => void;
  filmRenderer: 'cloud' | 'local';
  reloadKey: number;
  onSceneStatus: (s: ScenePreviewStatus, detail?: string) => void;
  capture: React.MutableRefObject<CaptureHandle>;
  user: React.MutableRefObject<UserXform>;
  view: ViewLabel;
}) {
  const t = useTheme();
  const placeholder = (msg: string) => (
    <LinearGradient colors={t.stageBg} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name="cube-outline" size={40} color={t.textMuted} />
      <Text style={{ color: t.textMuted, marginTop: 8, fontWeight: '600' }}>{msg}</Text>
    </LinearGradient>
  );
  if (!asset) return placeholder('Pick or take a product photo');
  return (
    <Boundary key={mode} fallback={placeholder('3D preview is unavailable on this device')}>
      {mode === 'film' ? (
        filmRenderer === 'local' ? (
          <FilmStudio product={asset} scene={scene} playing={playing} hd={hd} />
        ) : sceneHtml ? (
          <>
            {beforeHtml && compareOn ? (
              <CompareScenes key="compare" before={beforeHtml} after={sceneHtml} asset={asset} playing={playing} hd={hd} reloadKey={reloadKey} onStatus={onSceneStatus} reveal={revealCompare} topInset={topInset} />
            ) : (
              <ScenePreview key="single" html={sceneHtml} asset={asset} playing={playing} hd={hd} reloadKey={reloadKey} onStatus={onSceneStatus} />
            )}
            {!!beforeHtml && !(compareOn && hideExitCompare) && (
              <Pressable onPress={() => { haptic.tap(); if (compareOn) onExitCompare(); else onToggleCompare(); }} accessibilityRole="button" accessibilityLabel={compareOn ? 'Exit compare' : 'Compare before and after'} hitSlop={6} style={{ position: 'absolute', ...(compareOn ? { bottom: exitCompareBottom, left: exitCompareLeft } : { top: 10 + topInset, left: 10 }), zIndex: 30, ...(Platform.OS === 'android' ? { elevation: 12 } : null) }}>
                <LinearGradient colors={compareOn ? ['rgba(14,16,26,0.72)', 'rgba(14,16,26,0.72)'] : t.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' }}>
                  <Ionicons name={compareOn ? 'close' : 'git-compare-outline'} size={15} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '900', letterSpacing: 0.3 }}>{compareOn ? 'Exit compare' : 'Before / After'}</Text>
                </LinearGradient>
              </Pressable>
            )}
          </>
        ) : scenePending && retouchStage ? (
          <RetouchBuilding uri={retouchUri ?? asset.cleanImageUri} stage={retouchStage} />
        ) : scenePending ? (
          <SceneBuilding uri={asset.cleanImageUri} images={progressImages} ready={readyCount} total={totalCount} />
        ) : sceneUnavailable ? (
          <SceneUnavailable onRetry={onRetryScene} onOffline={onOfflineScene} />
        ) : (
          placeholder('Generate a scene to preview it')
        )
      ) : (
        <CameraStudio product={asset} scene={scene} playing={playing} hd={hd} capture={capture} user={user} view={view} />
      )}
    </Boundary>
  );
});

/** Rough seconds per pipeline step, used for the "time left" hint (the cloud scene is the long one). */
const STEP_ETA_S = PIPELINE_STEPS.map((st) => st.etaS);
const LOADING_TIPS = [
  'Tip: drag with one finger to place the product, pinch to zoom.',
  'Tip: Pause the animation, then Harmonize to blend it into your photo.',
  `Tip: try the ${THEME_COUNT} themes in Settings.`,
  'Tip: export all views as a zip from Generated Product Views.',
];

/** A step row whose check mark pops in when the step completes. */
const LoadingStep = memo(function LoadingStep({ label, icon, state }: { label: string; icon: IconName; state: 'done' | 'active' | 'todo' }) {
  const pop = useRef(new Animated.Value(state === 'done' ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (state === 'done') Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [state, pop]);
  useEffect(() => {
    if (state !== 'active') return;
    const l = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true })]));
    l.start();
    return () => l.stop();
  }, [state, pulse]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: state === 'todo' ? 0.4 : 1 }}>
      <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
        {state === 'done' ? (
          <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
            <Ionicons name="checkmark-circle" size={20} color="#4ADE80" />
          </Animated.View>
        ) : state === 'active' ? (
          <Animated.View style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }}>
            <ActivityIndicator size="small" color="#fff" />
          </Animated.View>
        ) : (
          <Ionicons name={icon} size={16} color="#fff" />
        )}
      </View>
      <Text numberOfLines={1} style={{ flexShrink: 1, color: '#fff', fontSize: 12.5, fontWeight: state === 'active' ? '800' : '600' }}>{label}</Text>
    </View>
  );
});

/**
 * Branded loading screen for the whole generation: the user's own photo with a soft shimmer, named steps that tick off,
 * a progress bar with a live time estimate, and a rotating tip.
 */
const GenerationOverlay = memo(function GenerationOverlay({ step, label, photoUri, prep }: { step: number; label?: string; photoUri?: string; prep?: boolean }) {
  // prep = only the photo steps (cut-out, views, depth, analysis); the cloud scene step is left out
  const STEPS = prep ? PIPELINE_STEPS.slice(0, PREP_STEP_COUNT) : PIPELINE_STEPS;
  const ETAS = prep ? STEP_ETA_S.slice(0, PREP_STEP_COUNT) : STEP_ETA_S;
  const t = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(0)).current;
  const tipFade = useRef(new Animated.Value(1)).current;
  const [boxH, setBoxH] = useState(0);
  const [photoOk, setPhotoOk] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [tip, setTip] = useState(0);
  const startedAt = useRef(Date.now());
  const stepStartedAt = useRef(Date.now());

  useEffect(() => {
    const l1 = Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    const l2 = Animated.loop(Animated.sequence([Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    const l3 = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }));
    l1.start();
    l2.start();
    l3.start();
    return () => {
      l1.stop();
      l2.stop();
      l3.stop();
    };
  }, [shimmer, breathe, ring]);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(tipFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setTip((n) => (n + 1) % LOADING_TIPS.length);
        Animated.timing(tipFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }, 3600);
    return () => clearInterval(id);
  }, [tipFade]);
  useEffect(() => {
    stepStartedAt.current = Date.now();
    Animated.timing(prog, { toValue: (step + 0.55) / STEPS.length, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [step, prog]);
  useEffect(() => setPhotoOk(true), [photoUri]);

  const total = ETAS.reduce((a, b) => a + b, 0);
  const doneS = ETAS.slice(0, Math.min(step, ETAS.length)).reduce((a, b) => a + b, 0);
  const inStep = Math.min(ETAS[Math.min(step, ETAS.length - 1)] * 0.9, (Date.now() - stepStartedAt.current) / 1000);
  const left = Math.max(2, Math.round(total - doneS - inStep));
  const pct = Math.min(96, Math.round(((doneS + inStep) / total) * 100));
  const cur = STEPS[Math.min(step, STEPS.length - 1)];
  // The canvas height varies by phone: shrink the photo frame so the steps and the tip always fit.
  const FRAME = boxH > 0 ? Math.max(72, Math.min(132, Math.round(boxH - 380))) : 132;
  const hasPhoto = !!photoUri && photoOk;

  return (
    <View
      onLayout={(e) => setBoxH(Math.round(e.nativeEvent.layout.height))}
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 52, backgroundColor: 'rgba(8,10,22,0.95)' }]}
    >
      {hasPhoto && <Image source={{ uri: photoUri }} blurRadius={Platform.OS === 'android' ? 40 : 28} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} />}
      <LinearGradient pointerEvents="none" colors={[hexToRgba(t.primary, 0.35), 'rgba(8,10,22,0)', hexToRgba(t.accent, 0.3)]} style={StyleSheet.absoluteFill} />

      {/* photo frame with orbiting glow + shimmer */}
      <View style={{ width: FRAME + 36, height: FRAME + 36, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: FRAME + 30, height: FRAME + 30, transform: [{ rotate: ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
          <LinearGradient colors={[t.primary, 'rgba(255,255,255,0)', t.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 34 }} />
        </Animated.View>
        <Animated.View
          style={{
            width: FRAME,
            height: FRAME,
            borderRadius: 26,
            overflow: 'hidden',
            backgroundColor: '#1a1f33',
            borderWidth: 3,
            borderColor: 'rgba(255,255,255,0.9)',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }) }],
          }}
        >
          {hasPhoto ? <Image source={{ uri: photoUri }} onError={() => setPhotoOk(false)} style={{ width: FRAME, height: FRAME }} resizeMode="cover" /> : <CubeIcon size={46} color="rgba(255,255,255,0.9)" strokeWidth={1.8} />}
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -20, bottom: -20, width: 54, transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-90, FRAME + 40] }) }, { rotate: '18deg' }] }}>
            <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>
        </Animated.View>
      </View>

      <Text numberOfLines={1} style={{ color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 10, textAlign: 'center' }}>{label ?? cur.label}…</Text>

      {/* progress */}
      <View style={{ width: '78%', marginTop: 12 }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
          <Animated.View style={{ height: 8, borderRadius: 4, width: prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}>
            <LinearGradient colors={[t.primary, t.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 4 }} />
          </Animated.View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' }}>
            {elapsed}s · about {left}s left
          </Text>
        </View>
      </View>

      {/* steps */}
      <View style={{ marginTop: 10, gap: 5, alignSelf: 'center', maxWidth: '100%' }}>
        {STEPS.map((st, i) => (
          <LoadingStep key={st.id} label={st.label} icon={st.icon} state={i < step ? 'done' : i === step ? 'active' : 'todo'} />
        ))}
      </View>

      {/* the tip is pinned to the bottom edge so it can never be pushed off the canvas */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 12, opacity: tipFade }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}>
          <Ionicons name="bulb-outline" size={14} color="#FFD36B" />
          <Text numberOfLines={2} style={{ flexShrink: 1, color: 'rgba(255,255,255,0.85)', fontSize: 11.5, textAlign: 'center' }}>
            {LOADING_TIPS[tip].replace(/^Tip:\s*/i, '')}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
});

/** One-shot celebration when a scene arrives: a flash, an expanding ring and confetti. Calls onDone when finished. */
type RevealData = { original: string; clean: string; views: { label: string; uri: string }[] };

/**
 * End-of-generation reveal: the original photo splits open to show the cutout, the cutout turns into four angle cards
 * that fan out, then it lets go. Tap anywhere to skip. A light haptic marks each beat.
 */
const ResultReveal = ({ data, onClose }: { data: RevealData | null; onClose: () => void }) => {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const p = useRef(new Animated.Value(0)).current;
  const [caption, setCaption] = useState(0);
  const closing = useRef(false);
  const reduce = useReduceMotion();
  const cw = Math.min(230, width * 0.56);
  const ch = cw * 1.1;
  const CAPTIONS = ['Your photo', 'Background removed', 'Photos generated', 'Your 3D scene is on its way'];
  useEffect(() => {
    if (!data) return;
    closing.current = false;
    p.setValue(0);
    setCaption(0);
    const beats = [0.2, 0.42, 0.66];
    let last = 0;
    const id = p.addListener(({ value }) => {
      const b = beats.filter((x) => value >= x).length;
      if (b !== last) {
        last = b;
        setCaption(b);
        haptic.select();
      }
    });
    haptic.tap();
    Animated.timing(p, { toValue: 1, duration: reduce ? 2600 : 5200, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !closing.current) {
        closing.current = true;
        haptic.success();
        onClose();
      }
    });
    return () => p.removeListener(id);
  }, [data, p, onClose, reduce]);
  if (!data) return null;
  const seg = (a: number, b: number, from = 0, to = 1) => p.interpolate({ inputRange: [0, a, b, 1], outputRange: [from, from, to, to] });
  const intro = seg(0, 0.14); // photo card pops in
  const split = seg(0.2, 0.36); // halves slide apart
  const fan = seg(0.42, 0.62); // angle cards fan out
  const fade = p.interpolate({ inputRange: [0, 0.04, 0.94, 1], outputRange: [0, 1, 1, 0] });
  const original = data.original.startsWith('demo://') ? data.clean : data.original;
  const half = (side: 'l' | 'r') => (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        [side === 'l' ? 'left' : 'right']: 0,
        width: cw / 2,
        height: ch,
        overflow: 'hidden',
        opacity: split.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
        transform: [{ translateX: split.interpolate({ inputRange: [0, 1], outputRange: [0, side === 'l' ? -cw * 0.7 : cw * 0.7] }) }, { rotate: split.interpolate({ inputRange: [0, 1], outputRange: ['0deg', side === 'l' ? '-14deg' : '14deg'] }) }],
      }}
    >
      <Image source={{ uri: original }} style={{ position: 'absolute', top: 0, left: side === 'l' ? 0 : -cw / 2, width: cw, height: ch }} resizeMode="cover" />
    </Animated.View>
  );
  const angleCards = data.views.slice(0, 4);
  const spread = [-1.5, -0.5, 0.5, 1.5];
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        onPress={() => {
          if (closing.current) return;
          closing.current = true;
          p.stopAnimation();
          onClose();
        }}
        style={{ flex: 1 }}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,9,22,0.94)', opacity: fade, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}>
          {/* soft coloured light behind the cards */}
          <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center', transform: [{ translateY: -30 }] }}>
            <GlowDisc size={Math.min(width * 1.25, 460)} color={t.primary} alpha={0.1} />
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center', transform: [{ translateX: width * 0.22 }, { translateY: ch * 0.55 }] }}>
            <GlowDisc size={Math.min(width * 0.9, 340)} color={t.accent} alpha={0.1} />
          </View>
        </Animated.View>
        <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: fade }}>
          <View style={{ width: width, height: ch + 120, alignItems: 'center', justifyContent: 'center' }}>
            {/* cutout, revealed under the two halves; then it becomes the front card of the fan */}
            <Animated.View
              style={{
                position: 'absolute',
                width: cw,
                height: ch,
                borderRadius: 22,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#161a2e',
                borderWidth: 1.5,
                borderColor: hexToRgba(t.accent, 0.7),
                opacity: fan.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0] }),
                transform: [{ scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
              }}
            >
              <LinearGradient colors={[hexToRgba(t.primary, 0.55), hexToRgba(t.accent, 0.4)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <View style={{ position: 'absolute', width: cw * 0.7, height: cw * 0.7, borderRadius: cw * 0.35, backgroundColor: 'rgba(255,255,255,0.16)' }} />
              <Image source={{ uri: data.clean }} style={{ width: cw * 0.86, height: ch * 0.86 }} resizeMode="contain" />
            </Animated.View>
            {/* the original photo, splitting in two */}
            <Animated.View style={{ position: 'absolute', width: cw, height: ch, borderRadius: 18, overflow: 'hidden', opacity: intro, transform: [{ scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }, { rotate: intro.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '0deg'] }) }] }}>
              {half('l')}
              {half('r')}
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 18, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' }]} />
            </Animated.View>
            {/* four angle cards fanning out */}
            {angleCards.map((v, i) => {
              const k = spread[i];
              const w = cw * 0.54;
              const hue = i % 2 === 0 ? t.primary : t.accent;
              return (
                <Animated.View
                  key={v.label}
                  style={{
                    position: 'absolute',
                    width: w,
                    borderRadius: 18,
                    backgroundColor: '#161a2e',
                    borderWidth: 1.5,
                    borderColor: hexToRgba(hue, 0.85),
                    shadowColor: hue,
                    shadowOpacity: 0.55,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    opacity: fan,
                    zIndex: 10 - Math.abs(k),
                    transform: [
                      { translateX: fan.interpolate({ inputRange: [0, 1], outputRange: [0, k * w * 0.8] }) },
                      { translateY: fan.interpolate({ inputRange: [0, 1], outputRange: [0, Math.abs(k) * 14 - 8] }) },
                      { rotate: fan.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${k * 9}deg`] }) },
                      { scale: fan.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                    ],
                  }}
                >
                  <View style={{ width: '100%', aspectRatio: 1, borderTopLeftRadius: 16.5, borderTopRightRadius: 16.5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                    <LinearGradient colors={[hexToRgba(t.primary, 0.5), hexToRgba(t.accent, 0.35)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    <View style={{ position: 'absolute', width: '70%', height: '70%', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)' }} />
                    <Image source={{ uri: v.uri }} style={{ width: '88%', height: '88%' }} resizeMode="contain" />
                    <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.6 }} style={StyleSheet.absoluteFill} />
                  </View>
                  <View style={{ height: 30, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase' }}>{v.label}</Text>
                  </View>
                </Animated.View>
              );
            })}
          </View>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 19, marginTop: 26, textAlign: 'center' }}>{CAPTIONS[caption]}</Text>
          <View style={{ flexDirection: 'row', gap: 7, marginTop: 14 }}>
            {CAPTIONS.map((_, i) => (
              <View key={i} style={{ width: i === caption ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: i === caption ? '#fff' : 'rgba(255,255,255,0.35)' }} />
            ))}
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 22, maxWidth: width - 60, textAlign: 'center' }}>Tap anywhere to continue</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const RevealBurst = memo(function RevealBurst({ colors, onDone }: { colors: string[]; onDone: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  const parts = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const ang = (i / 22) * Math.PI * 2 + (i % 3) * 0.17;
        const dist = 90 + ((i * 37) % 90);
        return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist + 46, size: 6 + (i % 4) * 2, color: colors[i % colors.length], round: i % 2 === 0, rot: (i * 53) % 360 };
      }),
    [colors],
  );
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => onDone());
  }, [a, onDone]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: a.interpolate({ inputRange: [0, 0.08, 0.4], outputRange: [0, 0.4, 0] }) }]} />
      <Animated.View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 4, borderColor: 'rgba(255,255,255,0.9)', opacity: a.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.8, 0.2, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.2, 3.2] }) }] }} />
      {parts.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.round ? p.size : p.size * 1.8,
            borderRadius: p.round ? p.size / 2 : 2,
            backgroundColor: p.color,
            opacity: a.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
              { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot + 360}deg`] }) },
              { scale: a.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.2, 1.1, 0.8] }) },
            ],
          }}
        />
      ))}
    </View>
  );
});

/* ---- image export helpers (share / PDF / zip). expo-sharing, expo-print, expo-file-system load lazily. ---- */
const extOf = (uri: string) => {
  const m = /\.(png|jpe?g|webp)(\?|$)/i.exec(uri);
  const e = (m?.[1] ?? 'png').toLowerCase();
  return e === 'jpeg' ? 'jpg' : e;
};

/**
 * Makes sure an image lives in a real local file. Anything that is not a file:// already (data: URIs, in-memory
 * Skia images, http) is decoded to an SkImage, encoded with encodeToBytes and written through writeToFile.
 */
/** Rejects instead of hanging forever when a native call never answers. */
function withDeadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${what} took too long`)), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Decodes a base64 `data:` URI straight to bytes (no network / Skia round trip). */
function dataUriBytes(uri: string): Uint8Array | null {
  const m = /^data:[^;,]*;base64,(.*)$/s.exec(uri);
  if (!m) return null;
  const str = m[1].replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((str.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < str.length; i += 4) {
    const a = B64.indexOf(str[i]);
    const b = B64.indexOf(str[i + 1]);
    const c = i + 2 < str.length ? B64.indexOf(str[i + 2]) : -1;
    const d = i + 3 < str.length ? B64.indexOf(str[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}
async function ensureFileUri(uri: string, name: string): Promise<string> {
  if (uri.startsWith('file://')) return uri;
  const direct = dataUriBytes(uri);
  const bytes = direct ?? (await loadSkImage(uri)).encodeToBytes(ImageFormat.PNG, 100);
  // const dest = `${Paths.cache.uri}${name.replace(/[^a-z0-9_-]+/gi, '_')}.png`;
  const dest = `${name.replace(/[^a-z0-9_-]+/gi, '_')}.png`;
  return writeToFile(dest, bytes);
}

async function imageToDataUri(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  const img = await loadSkImage(uri);
  const b64 = img.encodeToBase64();
  const e = extOf(uri);
  return `data:image/${e === 'jpg' ? 'jpeg' : e};base64,${b64}`;
}

async function shareFile(uri: string, mimeType: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  // expo-sharing only takes file:// URLs; the zip / PDF helpers may return a bare path like /data/user/0/.../kit.zip
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) uri = `file://${uri.startsWith('/') ? '' : '/'}${uri}`;
  // Android only lets the share sheet read files inside the app's cache / files folders: copy anything else there first.
  try {
    if (!uri.startsWith(Paths.cache.uri) && !uri.startsWith(Paths.document.uri)) {
      const name = decodeURIComponent(uri.split('?')[0].split('/').pop() || 'share');
      const dest = new File(Paths.cache, `share-${Date.now().toString(36)}-${name}`);
      if (dest.exists) dest.delete();
      new File(uri).copy(dest);
      uri = dest.uri;
    }
  } catch (e) {
    console.warn('[Magic3DStudio] could not copy the file into the cache before sharing - sharing it where it is', e);
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : mimeType === 'text/html' ? 'public.html' : undefined });
}

/**
 * Writes a generated scene page to a real .html file (its own cache sub-folder, so the file keeps a clean name) and opens the
 * share sheet: Save to Files / Drive, AirDrop, mail, chat ... which is also how a page is downloaded.
 */
async function shareHtmlPage(html: string, fileName: string, title: string) {
  const clean = fileName.replace(/[^a-z0-9._-]+/gi, '_').replace(/\.html?$/i, '') + '.html';
  const dir = new Directory(Paths.cache, `share-${Date.now().toString(36)}`);
  dir.create({ intermediates: true, idempotent: true });
  const f = new File(dir, clean);
  if (f.exists) f.delete();
  f.create();
  f.write(html);
  await shareFile(f.uri, 'text/html', title);
}

async function shareImageFile(item: { uri: string; label: string }) {
  const file = await ensureFileUri(item.uri, `magic3d_${item.label}`);
  await shareFile(file, `image/${extOf(file) === 'jpg' ? 'jpeg' : extOf(file)}`, `Share ${item.label}`);
}

/** One image on one A4 page (595 x 842 pt), centred, then handed to the share sheet. */
async function exportImageAsPdf(item: { uri: string; label: string }) {
  const src = await imageToDataUri(item.uri);
  const label = item.label.replace(/[<>&]/g, '');
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .page { width: 210mm; height: 297mm; box-sizing: border-box; padding: 14mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    img { max-width: 100%; max-height: 252mm; object-fit: contain; }
    .cap { margin-top: 8mm; font: 600 12px -apple-system, Helvetica, Arial, sans-serif; color: #555; text-transform: capitalize; letter-spacing: .04em; }
  </style></head><body><div class="page"><img src="${src}"/></div></body></html>`;
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  await Print.printAsync({uri:uri});
  await shareFile(uri, 'application/pdf', `${item.label}.pdf`);
}

type GalleryItem =
  | { kind: 'view'; key: string; label: string; uri: string; pending?: boolean; idle?: boolean; failed?: boolean }
  | { kind: 'platform'; key: string; label: string; dimension: string; uri: string };

const POLAROID_PAPER = '#FBF9F4';
const POLAROID_INK = '#2B2A33';
const HAND_FONT = Platform.select({ ios: 'Noteworthy', android: 'serif', default: undefined });

/** Compact grid card for the Product Views modal: tap = preview, long-press / "more" = actions. */
const GridCard = memo(function GridCard({ item, width, marked, onOpen, onMenu }: { item: GalleryItem; width: number; marked?: boolean; onOpen: (key: string) => void; onMenu: (item: GalleryItem) => void }) {
  const t = useTheme();
  const isView = item.kind === 'view';
  const sub = item.kind === 'platform' ? item.dimension.replace('x', ' × ') : item.label === 'scene' ? 'Scene image' : 'Product angle';
  const side = Math.round(width * 0.92);
  return (
    <View style={{ width }}>
      <Pressable
        onPress={() => {
          haptic.tap();
          onOpen(item.key);
        }}
        onLongPress={() => {
          haptic.select();
          onMenu(item);
        }}
        delayLongPress={360}
        accessibilityRole="imagebutton"
        accessibilityLabel={`${item.label} image`}
        accessibilityHint="Double tap to preview. Long press for more actions."
        style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: t.surface, borderWidth: marked ? 2 : 1, borderColor: marked ? t.primary : t.border, ...elevation(1, '#1b1640') }}
      >
        <View style={{ width: '100%', height: side, backgroundColor: t.stageBg[0] }}>
          {isView && (item.pending || item.idle || item.failed) ? (
            <ViewPlaceholder label={item.label} />
          ) : isView ? (
            <>
              <Image source={{ uri: item.uri }} blurRadius={Platform.OS === 'android' ? 18 : 14} style={[StyleSheet.absoluteFill, { opacity: 0.85 }]} resizeMode="cover" />
              <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </>
          ) : (
            <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          {isView && item.pending && <PendingShade />}
          {isView && item.idle && <IdleBadge />}
          {isView && item.failed && <UnavailableBadge />}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4, minHeight: 52 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 14.5, fontWeight: '800', textTransform: isView ? 'capitalize' : 'none' }}>
              {item.label}
            </Text>
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: 11, marginTop: 1 }}>
              {sub}
            </Text>
          </View>
          <Pressable onPress={() => onMenu(item)} hitSlop={hitFor(36)} accessibilityRole="button" accessibilityLabel={`More actions for ${item.label}`} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="ellipsis-horizontal" size={18} color={t.textMuted} />
          </Pressable>
        </View>
      </Pressable>
      {marked && (
        <View style={{ position: 'absolute', top: 8, left: 8, paddingHorizontal: 9, height: 22, borderRadius: 11, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '900' }}>COMPARE</Text>
        </View>
      )}
    </View>
  );
});

/**
 * Studio shelf card: a large polaroid that leans toward your finger while you touch it (more than a tap = no tilt),
 * opens the preview on tap and the action sheet on long press or the "more" button.
 */
const StudioCard = memo(function StudioCard({ item, width, marked, onOpen, onMenu }: { item: GalleryItem; width: number; marked?: boolean; onOpen: (key: string) => void; onMenu: (item: GalleryItem) => void }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const start = useRef<{ x: number; y: number } | null>(null);
  const flip = useRef(new Animated.Value(1)).current;
  const prevUri = useRef(item.uri);
  useEffect(() => {
    if (prevUri.current === item.uri) return;
    prevUri.current = item.uri;
    if (reduce) return;
    flip.setValue(0);
    Animated.spring(flip, { toValue: 1, ...MOTION.spring, useNativeDriver: true }).start();
  }, [item.uri, flip, reduce]);
  const rest = () => {
    start.current = null;
    Animated.parallel([
      Animated.spring(tx, { toValue: 0, ...MOTION.spring, useNativeDriver: true }),
      Animated.spring(ty, { toValue: 0, ...MOTION.spring, useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: MOTION.fast, useNativeDriver: true }),
    ]).start();
  };
  const isView = item.kind === 'view';
  const photo = width - 16;
  const sub = item.kind === 'platform' ? item.dimension : item.label === 'scene' ? 'Scene image' : 'Product angle';
  return (
    <Animated.View
      onTouchStart={(e) => {
        if (reduce) return;
        start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        Animated.timing(lift, { toValue: 1, duration: MOTION.fast, useNativeDriver: true }).start();
      }}
      onTouchMove={(e) => {
        const s0 = start.current;
        if (!s0) return;
        tx.setValue(clamp((e.nativeEvent.pageX - s0.x) / 50, -1, 1));
        ty.setValue(clamp((e.nativeEvent.pageY - s0.y) / 50, -1, 1));
      }}
      onTouchEnd={rest}
      onTouchCancel={rest}
      style={{
        width,
        marginRight: SP.md,
        transform: [
          { perspective: 800 },
          { rotateY: tx.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] }) },
          { rotateX: ty.interpolate({ inputRange: [-1, 1], outputRange: ['9deg', '-9deg'] }) },
          { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) },
        ],
      }}
    >
      <Pressable
        onPress={() => {
          haptic.tap();
          onOpen(item.key);
        }}
        onLongPress={() => {
          haptic.select();
          onMenu(item);
        }}
        delayLongPress={360}
        accessibilityRole="imagebutton"
        accessibilityLabel={`${item.label} image`}
        accessibilityHint="Double tap to preview. Long press for more actions."
        style={{ padding: 8, paddingBottom: 0, borderRadius: RADIUS.sm, backgroundColor: POLAROID_PAPER, borderWidth: marked ? 2.5 : 0, borderColor: t.primary, ...elevation(2, '#1b1640') }}
      >
        <Animated.View style={{ width: photo - (marked ? 5 : 0), height: photo - (marked ? 5 : 0), borderRadius: 4, overflow: 'hidden', backgroundColor: '#E9ECF2', transform: [{ perspective: 700 }, { rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] }) }] }}>
          {isView && (item.pending || item.idle || item.failed) ? (
            <ViewPlaceholder label={item.label} />
          ) : isView ? (
            <>
              <Image source={{ uri: item.uri }} blurRadius={Platform.OS === 'android' ? 18 : 14} style={[StyleSheet.absoluteFill, { opacity: 0.9 }]} resizeMode="cover" />
              <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </>
          ) : (
            <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          {isView && item.pending && <PendingShade />}
          {isView && item.idle && <IdleBadge />}
          {isView && item.failed && <UnavailableBadge />}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderRadius: 4 }]} />
        </Animated.View>
        <View style={{ height: 54, flexDirection: 'row', alignItems: 'center', paddingLeft: 4 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: POLAROID_INK, fontSize: 16, fontFamily: HAND_FONT, fontWeight: '700', textTransform: isView ? 'capitalize' : 'none' }}>
              {item.label}
            </Text>
            <Text numberOfLines={1} style={{ color: '#8A8794', fontSize: 10.5, marginTop: 1 }}>
              {sub}
            </Text>
          </View>
          <Pressable onPress={() => onMenu(item)} hitSlop={hitFor(32)} accessibilityRole="button" accessibilityLabel={`More actions for ${item.label}`} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="ellipsis-horizontal" size={18} color="#6B6878" />
          </Pressable>
        </View>
      </Pressable>
      {marked && (
        <View style={{ position: 'absolute', top: -8, left: -6, paddingHorizontal: 9, height: 22, borderRadius: 11, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>COMPARE</Text>
        </View>
      )}
    </Animated.View>
  );
});

/** Long-press / "more" menu for one image. */
const ItemActionSheet = ({ item, compareWith, canRemove, onClose, onShare, onPdf, onBackground, onCompare, onRemove }: { item: GalleryItem | null; compareWith: GalleryItem | null; canRemove: boolean; onClose: () => void; onShare: () => void; onPdf: () => void; onBackground: () => void; onCompare: () => void; onRemove: () => void }) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  if (!item) return null;
  const row = (icon: IconName, label: string, onPress: () => void, danger?: boolean) => (
    <Pressable
      key={label}
      onPress={() => {
        haptic.tap();
        onClose();
        setTimeout(onPress, 220);
      }}
      accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: SP.md, paddingHorizontal: SP.md, borderRadius: RADIUS.lg, backgroundColor: pressed ? hexToRgba(danger ? '#E5484D' : t.primary, 0.12) : 'transparent' })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(danger ? '#E5484D' : t.primary, 0.12) }}>
        <Ionicons name={icon} size={19} color={danger ? '#E5484D' : t.primary} />
      </View>
      <Text style={{ flex: 1, color: danger ? '#E5484D' : t.text, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
  const isImg = item.kind === 'view';
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(8,8,16,0.55)', justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable onPress={() => undefined} style={{ backgroundColor: t.surface, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SP.lg, paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 0) + SP.lg }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: SP.md }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md, marginBottom: SP.sm, paddingHorizontal: SP.xs }}>
            <Image source={{ uri: item.uri }} style={{ width: 52, height: 52, borderRadius: RADIUS.md, backgroundColor: '#E9ECF2' }} resizeMode="cover" />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: t.text, ...TYPE.title, textTransform: 'capitalize' }}>{item.label}</Text>
              <Text style={{ color: t.textMuted, ...TYPE.caption }}>{item.kind === 'platform' ? item.dimension : 'Product image'}</Text>
            </View>
          </View>
          {row('share-outline', 'Share image', onShare)}
          {row('document-text-outline', 'Export as PDF (A4)', onPdf)}
          {row('image-outline', 'Use as background', onBackground)}
          {row('git-compare-outline', compareWith && compareWith.key !== item.key ? `Compare with ${compareWith.label}` : 'Compare with another', onCompare)}
          {canRemove && row('trash-outline', 'Remove from list', onRemove, true)}
          {!isImg && <View />}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

/** Two images, one draggable divider (reuses the before/after slider). */
const CompareModal = ({ pair, onClose }: { pair: [GalleryItem, GalleryItem] | null; onClose: () => void }) => {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!pair) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(8,8,16,0.94)', paddingTop: Math.max(insets.top, 24) + 8, paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 16) + 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP.lg, marginBottom: SP.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', ...TYPE.headline, textTransform: 'capitalize' }} numberOfLines={1}>
              {pair[0].label} vs {pair[1].label}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12.5, marginTop: 2 }}>Drag the divider to compare</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close comparison" hitSlop={hitFor(40)} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' }}>
            <XIcon size={20} color="#fff" strokeWidth={2.4} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.lg }}>
          <BeforeAfterSlider beforeUri={pair[0].uri} afterUri={pair[1].uri} maxW={width - SP.lg * 2} maxH={height * 0.62} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: SP.sm }}>
          <Surface variant="glass" radius={RADIUS.pill} padding={0} style={{ paddingHorizontal: SP.lg, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12.5, textTransform: 'capitalize' }}>{pair[0].label}  |  {pair[1].label}</Text>
          </Surface>
        </View>
      </View>
    </Modal>
  );
};

/** Shown on a tile whose cloud image could not be downloaded in time. */
const UnavailableBadge = memo(function UnavailableBadge() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(120,30,40,0.85)' }}>
        <Ionicons name="cloud-offline-outline" size={12} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>Not available</Text>
      </View>
    </View>
  );
});

/** Small label for a reserved tile that the next generation will fill. */
const IdleBadge = memo(function IdleBadge() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.45)' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(20,22,30,0.78)' }}>
        <Ionicons name="sparkles-outline" size={12} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>Made on generate</Text>
      </View>
    </View>
  );
});

const VIEW_GLYPH: Record<string, IconName> = {
  front: 'scan-outline',
  left: 'arrow-back-circle-outline',
  right: 'arrow-forward-circle-outline',
  back: 'refresh-circle-outline',
  scene: 'image-outline',
};
/** Stable colour per product view / platform label, so each card family has its own palette slot. */
const viewTone = (t: Theme, label?: string): string => {
  const key = (label ?? '').toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return t.palette[h % t.palette.length];
};
/** Shown for an angle / scene image that is not there yet (being generated, not requested or failed): a soft gradient with a glyph, never a demo photo. */
const ViewPlaceholder = memo(function ViewPlaceholder({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <LinearGradient colors={[hexToRgba(viewTone(t, label), 0.3), hexToRgba(t.accent, 0.22), hexToRgba(t.palette[3], 0.14)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ width: '46%', aspectRatio: 1, maxWidth: 76, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={VIEW_GLYPH[label] ?? 'cube-outline'} size={28} color={viewTone(t, label)} />
      </View>
    </View>
  );
});

/** Soft pulsing veil + label over an image the cloud is still generating. */
const PendingShade = memo(function PendingShade() {
  const v = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) return;
    const l = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 900, useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: 900, useNativeDriver: true })]));
    l.start();
    return () => l.stop();
  }, [v, reduce]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.55)', opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }) }]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(20,22,30,0.78)' }}>
        <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.7 }] }} />
        <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>Generating</Text>
      </View>
    </View>
  );
});

/** Icon for a platform export card (Facebook, Amazon...). Anything unknown falls back to a storefront. */
const platformGlyph = (name: string): IconName =>
  /facebook/i.test(name) ? 'logo-facebook' : /amazon/i.test(name) ? 'logo-amazon' : /instagram/i.test(name) ? 'logo-instagram' : /tiktok/i.test(name) ? 'logo-tiktok' : /pinterest/i.test(name) ? 'logo-pinterest' : /youtube/i.test(name) ? 'logo-youtube' : 'storefront-outline';

/** One fixed size for EVERY card of the Generated Product Views shelf (angles, scene and platform exports alike). */
const PV_CARD_W = 136;
const PV_PHOTO_H = 118;
const PV_FOOTER_H = 42;
const PV_PAD = 6;
const PV_CARD_H = PV_PAD * 2 + PV_PHOTO_H + PV_FOOTER_H;
const PV_GAP = 12;

/**
 * Product-view card for the horizontal shelf. Every card has exactly the same width and height: a rounded white card,
 * a soft stage-coloured photo window (the image is always shown WHOLE, centred, over a blurred copy of itself so nothing
 * is cropped and there are no bars), and a footer with a small icon chip, the name and a one-line caption.
 */
const ProductViewCard = memo(function ProductViewCard({ item, onPress }: { item: GalleryItem; onPress?: () => void }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const isView = item.kind === 'view';
  const notReady = isView && (item.pending || item.idle || item.failed);
  // When a cloud image replaces the local one, the photo flips over like a card being turned.
  const flip = useRef(new Animated.Value(1)).current;
  const prevUri = useRef(item.uri);
  useEffect(() => {
    if (prevUri.current === item.uri) return;
    prevUri.current = item.uri;
    if (reduce) return;
    flip.setValue(0);
    Animated.spring(flip, { toValue: 1, ...MOTION.spring, useNativeDriver: true }).start();
  }, [item.uri, flip, reduce]);

  const sub = item.kind === 'platform' ? item.dimension.replace('x', ' × ') : item.label === 'scene' ? 'Scene image' : 'Product angle';
  const icon: IconName = item.kind === 'platform' ? platformGlyph(item.label) : item.label === 'scene' ? 'image-outline' : 'cube-outline';

  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      accessibilityRole="imagebutton"
      accessibilityLabel={`${item.label} image`}
      accessibilityHint="Double tap to preview."
      style={({ pressed }) => ({
        width: PV_CARD_W,
        height: PV_CARD_H,
        padding: PV_PAD,
        borderRadius: 22,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        ...elevation(1, '#1b1640'),
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {/* Photo window: identical size on every card */}
      <Animated.View
        style={{
          width: '100%',
          height: PV_PHOTO_H,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: t.stageBg[0],
          transform: [{ perspective: 700 }, { rotateY: flip.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] }) }, { scale: flip.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
        }}
      >
        <LinearGradient colors={t.stageBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {notReady ? (
          <ViewPlaceholder label={item.label} />
        ) : (
          <>
            <Image source={{ uri: item.uri }} blurRadius={Platform.OS === 'android' ? 18 : 14} style={[StyleSheet.absoluteFill, { opacity: 0.85 }]} resizeMode="cover" />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.18)' }]} />
            <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          </>
        )}
        {isView && item.pending && <PendingShade />}
        {isView && item.idle && <IdleBadge />}
        {isView && item.failed && <UnavailableBadge />}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderRadius: 16 }]} />
      </Animated.View>

      {/* Footer: icon chip + name + caption */}
      <View style={{ height: PV_FOOTER_H, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
        <View style={{ width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(viewTone(t, item.label), 0.14) }}>
          <Ionicons name={icon} size={15} color={viewTone(t, item.label)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontSize: 13, fontWeight: '800', textTransform: isView ? 'capitalize' : 'none' }}>
            {item.label}
          </Text>
          <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: 10.5, marginTop: 1 }}>
            {sub}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

/** Full-screen swipeable viewer. Each page carries its own glass HUD: share the image, or export it as an A4 PDF. */
/**
 * Pinch + double-tap zoom for one photo, clipped to its window. Pan only becomes active once zoomed in, so a
 * 1x photo still lets the carousel swipe. Gesture callbacks run on the JS thread (runOnJS) for compatibility.
 */
const ZoomView = ({ uri, w, h, active, onZoomChange }: { uri: string; w: number; h: number; active: boolean; onZoomChange: (zoomed: boolean) => void }) => {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const saved = useRef({ scale: 1, tx: 0, ty: 0 });
  const [zoomed, setZoomed] = useState(false);
  const MAX = 5;

  const limits = (sc: number) => ({ x: (w * (sc - 1)) / 2, y: (h * (sc - 1)) / 2 });
  const settle = useCallback(
    (sc: number, x: number, y: number) => {
      const l = limits(sc);
      const cx = clamp(x, -l.x, l.x);
      const cy = clamp(y, -l.y, l.y);
      saved.current = { scale: sc, tx: cx, ty: cy };
      tx.value = withTiming(cx, { duration: 120 });
      ty.value = withTiming(cy, { duration: 120 });
      const z = sc > 1.02;
      setZoomed(z);
      onZoomChange(z);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, h, onZoomChange],
  );
  const reset = useCallback(() => {
    scale.value = withTiming(1, { duration: 180 });
    tx.value = withTiming(0, { duration: 180 });
    ty.value = withTiming(0, { duration: 180 });
    saved.current = { scale: 1, tx: 0, ty: 0 };
    setZoomed(false);
    onZoomChange(false);
  }, [onZoomChange, scale, tx, ty]);
  useEffect(() => {
    if (!active) reset(); // leaving a photo returns it to 1x
  }, [active, reset]);

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((e) => {
      scale.value = clamp(saved.current.scale * e.scale, 1, MAX);
    })
    .onEnd(() => {
      const sc = clamp(scale.value, 1, MAX);
      if (sc < 1.05) reset();
      else {
        scale.value = withTiming(sc, { duration: 100 });
        settle(sc, saved.current.tx, saved.current.ty);
      }
    });
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(zoomed)
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      const l = limits(saved.current.scale);
      tx.value = clamp(saved.current.tx + e.translationX, -l.x * 1.1, l.x * 1.1);
      ty.value = clamp(saved.current.ty + e.translationY, -l.y * 1.1, l.y * 1.1);
    })
    .onEnd(() => settle(saved.current.scale, tx.value, ty.value));
  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd((_e, ok) => {
      if (!ok) return;
      if (saved.current.scale > 1.05) reset();
      else {
        scale.value = withTiming(2.6, { duration: 200 });
        settle(2.6, 0, 0);
      }
    });
  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));
  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View style={[{ width: w, height: h }, style]}>
        <Image source={{ uri }} style={{ width: w, height: h }} resizeMode="contain" />
      </Reanimated.View>
    </GestureDetector>
  );
};

const VIEWER_PAD = 10;
const VIEWER_FOOT = 78;
const VIEWER_MAX_SIDE = 720;
const VIEWER_THUMB = 64;
const VIEWER_THUMB_GAP = 10;
const VIEWER_STRIP_PAD = 16;

/**
 * Card for ONE image in the full-screen viewer. Every card has exactly the same size whatever the image's own aspect
 * ratio: a square photo window (the image is shown WHOLE over a blurred copy of itself, so nothing is cropped and there
 * are no bars) and a footer with the icon chip, name, caption and the action buttons (`actions`).
 */
const FittedImage = ({ item, maxW, maxH, active, onZoomChange, actions }: { item: GalleryItem; maxW: number; maxH: number; active: boolean; onZoomChange: (z: boolean) => void; actions?: ReactNode }) => {
  const t = useTheme();
  const isView = item.kind === 'view';
  const notReady = isView && (item.pending || item.idle || item.failed);
  const side = Math.max(120, Math.floor(Math.min(maxW - VIEWER_PAD * 2, maxH - VIEWER_PAD * 2 - VIEWER_FOOT, VIEWER_MAX_SIDE)));
  const sub = item.kind === 'platform' ? item.dimension.replace('x', ' × ') : item.label === 'scene' ? 'Scene image' : 'Product angle';
  const icon: IconName = item.kind === 'platform' ? platformGlyph(item.label) : item.label === 'scene' ? 'image-outline' : 'cube-outline';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: side + VIEWER_PAD * 2,
          height: side + VIEWER_PAD * 2 + VIEWER_FOOT,
          padding: VIEWER_PAD,
          borderRadius: 30,
          backgroundColor: t.surface,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 26,
          shadowOffset: { width: 0, height: 14 },
          elevation: 14,
        }}
      >
        {/* photo window: always the same square */}
        <View style={{ width: side, height: side, borderRadius: 22, overflow: 'hidden', backgroundColor: t.stageBg[0] }}>
          <LinearGradient colors={t.stageBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {notReady ? (
            <ViewPlaceholder label={item.label} />
          ) : (
            <>
              <Image source={{ uri: item.uri }} blurRadius={Platform.OS === 'android' ? 20 : 16} style={[StyleSheet.absoluteFill, { opacity: 0.8 }]} resizeMode="cover" />
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
              <ZoomView uri={item.uri} w={side} h={side} active={active} onZoomChange={onZoomChange} />
            </>
          )}
          {isView && item.pending && <PendingShade />}
          {isView && item.idle && <IdleBadge />}
          {isView && item.failed && <UnavailableBadge />}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderRadius: 22 }]} />
        </View>
        {/* footer */}
        <View style={{ height: VIEWER_FOOT, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 6, paddingRight: 2 }}>
          <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(viewTone(t, item.label), 0.14) }}>
            <Ionicons name={icon} size={21} color={viewTone(t, item.label)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 18, fontWeight: '800', textTransform: isView ? 'capitalize' : 'none' }}>
              {item.label}
            </Text>
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: 12.5, marginTop: 1 }}>
              {sub}
            </Text>
          </View>
          {actions}
        </View>
      </View>
    </View>
  );
};

const ImagePreviewModal = ({
  visible,
  items,
  startIndex,
  onClose,
  onToast,
}: {
  visible: boolean;
  items: GalleryItem[];
  startIndex: number;
  onClose: () => void;
  onToast: (m: string) => void;
}) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const [index, setIndex] = useState(startIndex);
  const [busy, setBusy] = useState<null | 'share' | 'pdf'>(null);
  const carouselRef = useRef<any>(null);
  const [zoomed, setZoomed] = useState(false); // a zoomed photo is panned by the finger, so the carousel must not swipe
  const stripRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (visible) setIndex(startIndex);
    setZoomed(false);
  }, [visible, startIndex]);
  // keep the current thumbnail centred in the strip
  useEffect(() => {
    stripRef.current?.scrollTo({ x: Math.max(0, index * (VIEWER_THUMB + VIEWER_THUMB_GAP) - W / 2 + VIEWER_THUMB / 2 + VIEWER_STRIP_PAD), animated: true });
  }, [index, W]);

  const run = useCallback(
    async (kind: 'share' | 'pdf', item: GalleryItem) => {
      if (busy) return;
      haptic.tap();
      setBusy(kind);
      try {
        if (kind === 'share') await shareImageFile(item);
        else await exportImageAsPdf(item);
      } catch (e: any) {
        console.warn('[Magic3DStudio] export failed', e);
        onToast(e?.message ? String(e.message) : 'Export failed');
      } finally {
        setBusy(null);
      }
    },
    [busy, onToast],
  );

  const glass = {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(12,16,28,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  };
  const actionBtn = { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: hexToRgba(t.primary, 0.12) };
  const stageH = H - insets.top - insets.bottom - 200;
  const cur = items[index];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingTop: insets.top + 8, backgroundColor: 'rgba(8,10,20,0.35)' }}>
          {/* frosted backdrop: the current image, heavily blurred, + a real blur on iOS */}
          {cur && <Image source={{ uri: cur.uri }} blurRadius={Platform.OS === 'android' ? 45 : 30} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: 0.9 }]} />}
          <BlurView intensity={Platform.OS === 'ios' ? 70 : 25} tint="dark" style={StyleSheet.absoluteFill} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,14,28,0.35)' }]} />
          {/* header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 56 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text numberOfLines={1} style={{ color: '#fff', fontSize: 20, fontWeight: '800', textTransform: 'capitalize' }}>
                {cur?.label ?? ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                {items.length > 0 && (
                  <View style={{ paddingHorizontal: 9, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
                    <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '800' }}>{`${index + 1} / ${items.length}`}</Text>
                  </View>
                )}
                {cur?.kind === 'platform' && <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12.5 }}>{cur.dimension.replace('x', ' × ')}</Text>}
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close preview" style={glass}>
              <XIcon size={22} color="#fff" strokeWidth={2.4} />
            </Pressable>
          </View>

          {visible && items.length > 0 && (
            <Carousel
              ref={carouselRef}
              key={startIndex}
              style={{ width: W, height: stageH }}
              data={items}
              defaultIndex={Math.min(startIndex, items.length - 1)}
              loop={false}
              enabled={!zoomed}
              layout={{
                type: 'parallax',
                offset: 50,
                scale: 0.9,
                adjacentScale: 0.64,
              }}
              onSnapToItem={(i) => {
                haptic.select();
                setIndex(i);
                setZoomed(false);
              }}
              renderItem={({ item }: { item: GalleryItem }) => {
                const ready = !(item.kind === 'view' && (item.pending || item.idle || item.failed));
                return (
                  <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 8 }}>
                    <FittedImage
                      item={item}
                      maxW={W - 32}
                      maxH={stageH - 16}
                      active={item.key === cur?.key}
                      onZoomChange={setZoomed}
                      actions={
                        <View style={{ flexDirection: 'row', gap: 8, opacity: ready ? 1 : 0.35 }}>
                          <Pressable disabled={!ready} onPress={() => run('share', item)} accessibilityRole="button" accessibilityLabel="Share image" style={actionBtn}>
                            {busy === 'share' ? <ActivityIndicator color={t.primary} /> : <Share2 size={20} color={t.primary} strokeWidth={2.2} />}
                          </Pressable>
                          <Pressable disabled={!ready} onPress={() => run('pdf', item)} accessibilityRole="button" accessibilityLabel="Export as PDF" style={actionBtn}>
                            {busy === 'pdf' ? <ActivityIndicator color={t.primary} /> : <FileText size={20} color={t.primary} strokeWidth={2.2} />}
                          </Pressable>
                        </View>
                      }
                    />
                  </View>
                );
              }}
            />
          )}

          {/* thumbnail strip: identical rounded tiles, whole image visible, the current one is ringed and lifted */}
          <ScrollView
            ref={stripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ minWidth: W, justifyContent: 'center', alignItems: 'center', paddingHorizontal: VIEWER_STRIP_PAD, paddingTop: 12, paddingBottom: insets.bottom + 16 }}
          >
            {items.map((it, i) => {
              const on = i === index;
              const notReady = it.kind === 'view' && (it.pending || it.idle || it.failed);
              return (
                <Pressable
                  key={it.key}
                  onPress={() => carouselRef.current?.scrollTo({ index: i, animated: true })}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${it.label}`}
                  style={{
                    width: VIEWER_THUMB,
                    height: VIEWER_THUMB,
                    marginRight: i === items.length - 1 ? 0 : VIEWER_THUMB_GAP,
                    padding: 3,
                    borderRadius: 18,
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    borderWidth: 2,
                    borderColor: on ? '#fff' : 'transparent',
                    opacity: on ? 1 : 0.62,
                    transform: [{ scale: on ? 1.08 : 1 }],
                    shadowColor: '#000',
                    shadowOpacity: on ? 0.45 : 0,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 5 },
                    elevation: on ? 8 : 0,
                  }}
                >
                  <View style={{ flex: 1, borderRadius: 13, overflow: 'hidden', backgroundColor: t.stageBg[0] }}>
                    <LinearGradient colors={t.stageBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    {notReady ? <ViewPlaceholder label={it.label} /> : <Image source={{ uri: it.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

/* ---- colour maths for the picker ---- */
const hsvToHex = (h: number, s: number, v: number): string => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const x = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
  return `#${x(f(5))}${x(f(3))}${x(f(1))}`.toUpperCase();
};
const hexToHsv = (hex: string): { h: number; s: number; v: number } => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
};
const normalizeHex = (t: string): string | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${h.toUpperCase()}`;
};
const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'] as const;

/** Drag handler for a 1-D / 2-D slider surface. Reports 0..1 coordinates while moving and once more on release. */
function useDragSurface(size: React.MutableRefObject<{ w: number; h: number }>, onMove: (x: number, y: number, final: boolean) => void) {
  const cb = useRef(onMove);
  cb.current = onMove;
  const start = useRef({ x: 0, y: 0 });
  const at = (dx: number, dy: number, final: boolean) => {
    const { w, h } = size.current;
    cb.current(clamp((start.current.x + dx) / w, 0, 1), clamp((start.current.y + dy) / h, 0, 1), final);
  };
  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        start.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        at(0, 0, false);
      },
      onPanResponderMove: (_e, g) => at(g.dx, g.dy, false),
      onPanResponderRelease: (_e, g) => at(g.dx, g.dy, true),
    }),
  ).current;
}

/**
 * Custom colour picker: saturation/brightness square + rainbow hue bar + hex field. Dragging updates the preview
 * instantly; the colour is COMMITTED (and the images re-rendered) when the finger lifts or a hex is entered.
 */
const ColorPickerPanel = ({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) => {
  const t = useTheme();
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const [hexText, setHexText] = useState(value.toUpperCase());
  const svSize = useRef({ w: 1, h: 1 });
  const hueSize = useRef({ w: 1, h: 1 });

  const apply = useCallback(
    (next: { h: number; s: number; v: number }, final: boolean) => {
      setHsv(next);
      const hex = hsvToHex(next.h, next.s, next.v);
      setHexText(hex);
      if (final) onCommit(hex);
    },
    [onCommit],
  );
  const svPan = useDragSurface(svSize, (x, y, final) => apply({ h: hsvRef.current.h, s: x, v: 1 - y }, final));
  const huePan = useDragSurface(hueSize, (x, _y, final) => apply({ h: x * 360, s: hsvRef.current.s, v: hsvRef.current.v }, final));

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const pureHue = hsvToHex(hsv.h, 1, 1);
  const ring = { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 4 };
  return (
    <View style={{ borderRadius: 22, padding: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, marginBottom: 14 }}>
      <View
        style={{ height: 168, borderRadius: 16, overflow: 'hidden' }}
        onLayout={(e) => (svSize.current = { w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) })}
        {...svPan.panHandlers}
      >
        <LinearGradient pointerEvents="none" colors={['#FFFFFF', pureHue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', '#000000']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[{ position: 'absolute', width: 26, height: 26, borderRadius: 13, marginLeft: -13, marginTop: -13, left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hex }, ring]} />
      </View>
      <View
        style={{ height: 26, borderRadius: 13, marginTop: 14, justifyContent: 'center' }}
        onLayout={(e) => (hueSize.current = { w: Math.max(1, e.nativeEvent.layout.width), h: 1 })}
        {...huePan.panHandlers}
      >
        <LinearGradient pointerEvents="none" colors={[...HUE_STOPS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 14, borderRadius: 7 }} />
        <View pointerEvents="none" style={[{ position: 'absolute', width: 26, height: 26, borderRadius: 13, marginLeft: -13, left: `${(hsv.h / 360) * 100}%`, backgroundColor: pureHue }, ring]} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: hex, borderWidth: 1, borderColor: t.border }} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 14, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12, backgroundColor: t.dark ? 'rgba(255,255,255,0.05)' : '#fff' }}>
          <Text style={{ color: t.textMuted, fontWeight: '700', marginRight: 4 }}>HEX</Text>
          <TextInput
            value={hexText}
            onChangeText={(x) => {
              setHexText(x);
              const n = normalizeHex(x);
              if (n) {
                setHsv(hexToHsv(n));
                onCommit(n);
              }
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '700', paddingVertical: 0 }}
          />
        </View>
      </View>
    </View>
  );
};

/**
 * Before / after comparison: drag the handle, or let it glide back and forth on its own until you touch it.
 * variant 'dark' (default) sits on dark screens; 'light' adds a frosted white frame and a lavender Auto-slide pill.
 */
const BeforeAfterSlider = ({ beforeUri, afterUri, maxW, maxH, variant = 'dark' }: { beforeUri: string; afterUri: string; maxW: number; maxH: number; variant?: 'dark' | 'light' }) => {
  const t = useTheme();
  const light = variant === 'light';
  const FRAME = light ? 7 : 0;
  const [aspect, setAspect] = useState(1);
  const [autoOn, setAutoOn] = useState(true);
  useEffect(() => {
    let live = true;
    Image.getSize(afterUri, (w, h) => live && w > 0 && h > 0 && setAspect(w / h), () => undefined);
    return () => {
      live = false;
    };
  }, [afterUri]);
  let w = Math.max(1, maxW - FRAME * 2);
  let h = w / aspect;
  const hMax = Math.max(1, maxH - FRAME * 2);
  if (h > hMax) {
    h = hMax;
    w = h * aspect;
  }
  const wRef = useRef(w);
  wRef.current = w;
  const pos = useRef(new Animated.Value(0.5)).current; // 0 = all "after", 1 = all "before"
  const posVal = useRef(0.5);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const dragStart = useRef(0.5);

  useEffect(() => {
    const id = pos.addListener(({ value }) => (posVal.current = value));
    return () => pos.removeListener(id);
  }, [pos]);
  const stopAuto = useCallback(() => {
    anim.current?.stop();
    anim.current = null;
    setAutoOn(false);
  }, []);
  const startAuto = useCallback(() => {
    anim.current?.stop();
    const sweep = (to: number, ms: number) => Animated.timing(pos, { toValue: to, duration: ms, easing: Easing.inOut(Easing.cubic), useNativeDriver: false });
    anim.current = Animated.loop(Animated.sequence([sweep(0.94, 2400), Animated.delay(450), sweep(0.06, 3000), Animated.delay(450)]));
    anim.current.start();
    setAutoOn(true);
  }, [pos]);
  useEffect(() => {
    startAuto();
    return () => anim.current?.stop();
  }, [startAuto]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        anim.current?.stop();
        anim.current = null;
        setAutoOn(false);
        const v = clamp(e.nativeEvent.locationX / wRef.current, 0, 1);
        dragStart.current = v;
        pos.setValue(v);
      },
      onPanResponderMove: (_e, g) => pos.setValue(clamp(dragStart.current + g.dx / wRef.current, 0, 1)),
    }),
  ).current;

  const KNOB = 56;
  const clipW = pos.interpolate({ inputRange: [0, 1], outputRange: [0, w] });
  const lineX = Animated.subtract(clipW, 1.5);
  const knobX = Animated.subtract(clipW, KNOB / 2);
  const beforeOpacity = pos.interpolate({ inputRange: [0, 0.12, 0.2], outputRange: [0, 0.2, 1], extrapolate: 'clamp' });
  const afterOpacity = pos.interpolate({ inputRange: [0.8, 0.88, 1], outputRange: [1, 0.2, 0], extrapolate: 'clamp' });
  const chipBase = { position: 'absolute' as const, top: 14, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7, paddingHorizontal: 16, height: 38, borderRadius: 19 };
  const photo = (
    <View
      {...pan.panHandlers}
      style={{ width: w, height: h, borderRadius: 22, overflow: 'hidden', backgroundColor: '#0d0d14', ...(light ? null : { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }) }}
    >
      <Image source={{ uri: afterUri }} style={{ width: w, height: h }} resizeMode="cover" />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: clipW, overflow: 'hidden' }}>
        <Image source={{ uri: beforeUri }} style={{ width: w, height: h }} resizeMode="cover" />
      </Animated.View>
      {/* Before: dark glass pill */}
      <Animated.View pointerEvents="none" style={[chipBase, { left: 14, opacity: beforeOpacity, backgroundColor: 'rgba(38,34,46,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }]}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14.5 }}>Before</Text>
      </Animated.View>
      {/* After: glowing gradient pill with sparkles */}
      <Animated.View pointerEvents="none" style={[chipBase, { right: 14, opacity: afterOpacity, backgroundColor: t.cta[1], borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', shadowColor: t.cta[0], shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }]}>
        <LinearGradient colors={[t.cta[0], t.cta[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 19 }]} />
        <Ionicons name="sparkles" size={16} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14.5 }}>After</Text>
      </Animated.View>
      {/* divider + handle */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: 3, left: lineX, backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }} />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: h / 2 - KNOB / 2, left: knobX, width: KNOB, height: KNOB }}>
        <LinearGradient colors={['#FFFFFF', '#F4F4F8']} style={{ flex: 1, borderRadius: KNOB / 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.95)', shadowColor: t.primary, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
          <Ionicons name="chevron-back" size={19} color={t.primary} />
          <Ionicons name="chevron-forward" size={19} color={t.primary} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
  return (
    <View style={{ alignItems: 'center' }}>
      {light ? (
        <View style={{ padding: FRAME, borderRadius: 22 + FRAME, backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)', shadowColor: t.primary, shadowOpacity: 0.28, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}>{photo}</View>
      ) : (
        photo
      )}
      <Pressable
        onPress={autoOn ? stopAuto : startAuto}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={autoOn ? 'Pause auto-slide' : 'Start auto-slide'}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: light ? 18 : 12,
          paddingHorizontal: light ? 24 : 14,
          height: light ? 46 : 32,
          borderRadius: 23,
          backgroundColor: light ? hexToRgba(t.primary, 0.14) : 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          borderColor: light ? hexToRgba(t.primary, 0.32) : 'rgba(255,255,255,0.2)',
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}
      >
        <Ionicons name={autoOn ? 'pause' : 'play'} size={light ? 18 : 13} color={light ? t.primary : '#fff'} />
        <Text style={{ color: light ? t.primary : '#fff', fontWeight: '800', fontSize: light ? 16 : 12 }}>{autoOn ? 'Auto-slide on' : 'Auto-slide'}</Text>
      </Pressable>
    </View>
  );
};

/** Result sheet after Harmonize: before/after slider + share / PDF export of the harmonized image. */
const HarmonizeResultSheet = ({
  result,
  onClose,
  top,
  bottom,
  ctaColors,
  mock,
}: {
  result: { blendedUri: string; harmonizedUri: string } | null;
  onClose: () => void;
  top: number;
  bottom: number;
  ctaColors: [string, string];
  mock: boolean;
}) => {
  const t = useTheme();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState<null | 'share' | 'pdf'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (result) setMsg(null);
  }, [result]);
  const run = async (kind: 'share' | 'pdf') => {
    if (!result || busy) return;
    haptic.tap();
    setBusy(kind);
    setMsg(null);
    try {
      const item = { uri: result.harmonizedUri, label: 'harmonized' };
      if (kind === 'share') await shareImageFile(item);
      else await exportImageAsPdf(item);
    } catch (e: any) {
      console.warn('[Magic3DStudio] harmonized export failed', e);
      setMsg(e?.message ? String(e.message) : 'Export failed');
    } finally {
      setBusy(null);
    }
  };
  const INDIGO = t.primary;
  const glassBg = t.dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.88)';
  const glassBorder = t.dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.95)';
  const soft = { shadowColor: t.primary, shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 };
  const roundBtn = (icon: ReactNode, label: string, onPress: () => void) => (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: glassBg, borderWidth: 1.5, borderColor: glassBorder, transform: [{ scale: pressed ? 0.94 : 1 }], ...soft })}
    >
      {icon}
    </Pressable>
  );
  const pillAction = (kind: 'share' | 'pdf', label: string, icon: ReactNode) => (
    <Pressable
      onPress={() => run(kind)}
      disabled={!!busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ flex: 1, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: glassBg, borderWidth: 1.5, borderColor: glassBorder, opacity: busy && busy !== kind ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }], ...soft })}
    >
      {busy === kind ? <ActivityIndicator color={INDIGO} /> : icon}
      <Text style={{ color: INDIGO, fontSize: 16.5, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={!!result} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <LinearGradient colors={[t.bg[0], t.bg[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, paddingTop: top, paddingBottom: bottom, paddingHorizontal: 16 }}>
        {/* soft pastel blobs, like the mock */}
        <View pointerEvents="none" style={{ position: 'absolute', top: -70, right: -60, width: 230, height: 230, borderRadius: 115, backgroundColor: hexToRgba(t.primary, t.dark ? 0.22 : 0.26) }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 40, right: 70, width: 130, height: 130, borderRadius: 65, backgroundColor: hexToRgba(t.cta[1], t.dark ? 0.14 : 0.2) }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 60, left: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: hexToRgba(t.accent, t.dark ? 0.12 : 0.2) }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: -80, right: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: hexToRgba(t.cta[0], t.dark ? 0.12 : 0.16) }} />

        <View style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {/* header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            {roundBtn(<Ionicons name="chevron-back" size={24} color={t.text} />, 'Back', onClose)}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="color-wand" size={30} color={t.primary} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontSize: 23, fontWeight: '900', letterSpacing: -0.4 }}>Harmonize Photo</Text>
                <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: 14, marginTop: 1 }}>Blend your photo beautifully</Text>
              </View>
            </View>
            {roundBtn(<XIcon size={22} color={t.text} strokeWidth={2.4} />, 'Close', onClose)}
          </View>

          {/* comparison */}
          <View style={{ flex: 1, justifyContent: 'center' }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {result && box.w > 0 && <BeforeAfterSlider variant="light" beforeUri={result.blendedUri} afterUri={result.harmonizedUri} maxW={box.w} maxH={Math.max(120, box.h - 76)} />}
          </View>

          {/* actions */}
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 14 }}>
            {pillAction('share', 'Share', <Share2 size={22} color={INDIGO} strokeWidth={2.2} />)}
            {pillAction('pdf', 'Export PDF', <FileText size={22} color={INDIGO} strokeWidth={2.2} />)}
          </View>
          {msg && <Text style={{ color: '#E5484D', fontSize: 12.5, textAlign: 'center', marginTop: 10 }}>{msg}</Text>}
          {mock && <Text style={{ color: t.textMuted, fontSize: 11, textAlign: 'center', marginTop: 10 }}>Mock harmonize (simple colour grade). Connect the harmonize API for the real result.</Text>}
          <Pressable
            onPress={() => {
              haptic.tap();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Done"
            style={({ pressed }) => ({ marginTop: 14, transform: [{ scale: pressed ? 0.985 : 1 }] })}
          >
            <LinearGradient colors={[ctaColors[0], ctaColors[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 60, borderRadius: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', ...elevation(3, ctaColors[0]) }}>
              <Ionicons name="checkmark-circle-outline" size={30} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>Done</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </LinearGradient>
    </Modal>
  );
};

const VIEW_PICK_LABELS: Record<ViewLabel, string> = { front: 'Front', left: 'Left', right: 'Right', back: 'Back' };

/** Camera Studio: choose which single generated image is placed in the live view. */
const ViewPicker = ({ asset, value, onChange }: { asset: ProductAsset; value: ViewLabel; onChange: (v: ViewLabel) => void }) => {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '700' }}>PRODUCT VIEW</Text>
        <Text style={{ color: t.textMuted, fontSize: 10.5 }}>Effects apply to this image</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {VIEW_ORDER.map((v) => {
          const on = v === value;
          return (
            <Pressable
              key={v}
              onPress={() => {
                if (!on) haptic.select();
                onChange(v);
              }}
              style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${VIEW_PICK_LABELS[v]} view`} accessibilityState={{ selected: on }}>
              <View
                style={{
                  borderRadius: 18,
                  padding: 3,
                  borderWidth: on ? 2.5 : 1,
                  borderColor: on ? t.primary : t.border,
                  backgroundColor: on ? hexToRgba(t.primary, 0.1) : t.surface,
                  shadowColor: t.primary,
                  shadowOpacity: on ? 0.35 : 0,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  // Android's elevation shadow shows through the translucent fill as a white box behind the label
                  elevation: 0,
                }}
              >
                <View style={{ aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: t.dark ? '#1b2030' : '#EEF2F8' }}>
                  <Image source={{ uri: asset.views[v].imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  {on && (
                    <View style={{ position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 9, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={{ textAlign: 'center', color: on ? t.primary : t.text, fontWeight: on ? '800' : '600', fontSize: 11.5, paddingVertical: 5 }}>{VIEW_PICK_LABELS[v]}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const Chip = ({ label, icon, active, onPress, color }: { label: string; icon?: IconName; active: boolean; onPress: () => void; color?: string }) => {
  const t = useTheme();
  const c = color ?? t.primary;
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SP.sm - 2,
        paddingHorizontal: SP.md,
        paddingVertical: SP.sm,
        borderRadius: RADIUS.pill,
        marginRight: SP.sm,
        backgroundColor: active ? c : hexToRgba(c, t.dark ? 0.14 : 0.08),
        borderWidth: 1,
        borderColor: active ? c : hexToRgba(c, 0.32),
        transform: [{ scale: pressed ? 0.96 : 1 }],
        ...(active ? elevation(1, c) : null),
      })}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? '#fff' : c} />}
      <Text style={{ color: active ? '#fff' : t.text, ...TYPE.label }}>{label}</Text>
    </Pressable>
  );
};

const SheetModal = ({ visible, title, onClose, children, maxContentWidth }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; maxContentWidth?: number }) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(8,10,20,0.5)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <LinearGradient
          colors={t.dark ? [t.bg[1], t.bg[0]] : ['#FFFFFF', t.bg[1]]}
          style={{ ...(maxContentWidth ? { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' as const } : null), maxHeight: '90%', minHeight: '45%', borderTopLeftRadius: RADIUS.xxl + 2, borderTopRightRadius: RADIUS.xxl + 2, paddingHorizontal: SP.lg + 2, paddingTop: SP.sm + 2, paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 40 : 0) + 18, borderWidth: 1, borderBottomWidth: 0, borderColor: t.border }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: t.dark ? 'rgba(255,255,255,0.25)' : 'rgba(16,24,40,0.15)', marginBottom: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: t.text, ...TYPE.headline, letterSpacing: -0.3 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: t.dark ? 'rgba(255,255,255,0.1)' : 'rgba(16,24,40,0.06)' }}>
              <Ionicons name="close" size={20} color={t.text} />
            </Pressable>
          </View>
          {children}
        </LinearGradient>
      </View>
    </Modal>
  );
};

/** One theme as a miniature of the real screen: header, mode cards, CTA - so you see the look before applying it. */
const ThemeCard = memo(function ThemeCard({ item, selected, width, onPress }: { item: Theme; selected: boolean; width: number; onPress: () => void }) {
  const bar = (w: number | string, o = 0.85) => ({ width: w as any, height: 5, borderRadius: 3, backgroundColor: item.text, opacity: o });
  return (
    <Pressable onPress={onPress} style={{ width, marginBottom: 12 }} accessibilityRole="button" accessibilityLabel={`${item.name} theme`} accessibilityState={{ selected }}>
      <View
        style={{
          borderRadius: 20,
          borderWidth: selected ? 2.5 : 1,
          borderColor: selected ? item.primary : item.dark ? 'rgba(255,255,255,0.14)' : 'rgba(16,24,40,0.1)',
          shadowColor: item.primary,
          shadowOpacity: selected ? 0.4 : 0.12,
          shadowRadius: selected ? 12 : 6,
          shadowOffset: { width: 0, height: 4 },
          elevation: selected ? 6 : 2,
          backgroundColor: item.bg[0],
        }}
      >
        <LinearGradient colors={item.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 17, padding: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: item.primary }} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={bar('70%')} />
              <View style={{ ...bar('45%', 0.4), height: 4 }} />
            </View>
            <View style={{ width: 22, height: 10, borderRadius: 5, backgroundColor: item.accent }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 9 }}>
            {[item.steps[0], item.steps[1], item.steps[2]].map((c, i) => (
              <View key={i} style={{ flex: 1, height: 26, borderRadius: 9, backgroundColor: hexToRgba(c, item.dark ? 0.28 : 0.18), borderWidth: 1, borderColor: hexToRgba(c, 0.5), justifyContent: 'center', paddingHorizontal: 6 }}>
                <View style={{ width: '60%', height: 4, borderRadius: 2, backgroundColor: c }} />
              </View>
            ))}
          </View>
          <View style={{ height: 40, borderRadius: 11, marginTop: 8, backgroundColor: item.dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: item.border, justifyContent: 'center', paddingHorizontal: 8, gap: 4 }}>
            <View style={bar('80%', 0.5)} />
            <View style={bar('55%', 0.3)} />
          </View>
          <LinearGradient colors={item.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 20, borderRadius: 10, marginTop: 9 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <Text numberOfLines={1} style={{ color: item.text, fontWeight: '800', fontSize: 13, flex: 1 }}>
              {item.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: item.dark ? 'rgba(255,255,255,0.12)' : 'rgba(16,24,40,0.06)' }}>
              <Ionicons name={item.dark ? 'moon' : 'sunny'} size={9} color={item.textMuted} />
              <Text style={{ color: item.textMuted, fontSize: 9, fontWeight: '700' }}>{item.dark ? 'Dark' : 'Light'}</Text>
            </View>
          </View>
        </LinearGradient>
        {selected && (
          <View style={{ position: 'absolute', top: -8, right: -8, width: 26, height: 26, borderRadius: 13, backgroundColor: item.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff' }}>
            <Ionicons name="checkmark" size={15} color="#fff" />
          </View>
        )}
      </View>
    </Pressable>
  );
});

/** One settings section: a card with its own colour, an icon tile, a title + hint and a counter. */
const SettingsSection = ({ tint, icon, title, hint, badge, action, children }: { tint: string; icon: IconName; title: string; hint?: string; badge?: string; action?: ReactNode; children: ReactNode }) => {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 26, borderWidth: 1, borderColor: hexToRgba(tint, 0.22), backgroundColor: t.surface, overflow: 'hidden', marginBottom: 16, ...elevation(1, tint) }}>
      <LinearGradient pointerEvents="none" colors={[hexToRgba(tint, 0.14), hexToRgba(tint, 0)]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 96 }} />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LinearGradient colors={[tint, hexToRgba(tint, 0.7)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', ...elevation(2, tint) }}>
            <Ionicons name={icon} size={22} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 17, fontWeight: '900' }}>{title}</Text>
            {(!!badge || !!hint) && (
              <Text numberOfLines={2} style={{ color: t.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
                {!!badge && <Text style={{ color: tint, fontWeight: '900' }}>{badge}</Text>}
                {!!badge && !!hint ? '  ·  ' : ''}
                {hint}
              </Text>
            )}
          </View>
          {action}
        </View>
        <View style={{ marginTop: 16 }}>{children}</View>
      </View>
    </View>
  );
};

/** A selectable tile: coloured icon, label, optional caption and a check badge when on. */
const SettingsTile = ({ width, tint, on, icon, label, caption, onPress }: { width: number; tint: string; on: boolean; icon: IconName; label: string; caption?: string; onPress: () => void }) => {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={caption ? `${label}, ${caption}` : label}
      style={({ pressed }) => ({ width, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 18, backgroundColor: on ? hexToRgba(tint, 0.1) : t.bg[0], borderWidth: on ? 1.5 : 1, borderColor: on ? tint : t.border, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? tint : hexToRgba(t.textMuted, 0.14) }}>
        <Ionicons name={icon} size={19} color={on ? '#fff' : t.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: 13.5 }}>{label}</Text>
        {!!caption && <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: 11, marginTop: 1 }}>{caption}</Text>}
      </View>
      <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? tint : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: hexToRgba(t.textMuted, 0.45) }}>
        {on && <Ionicons name="checkmark" size={13} color="#fff" />}
      </View>
    </Pressable>
  );
};

/**
 * Compact theme swatch for the picker grid: the theme's background, an "Aa" in its text colour, its palette dots and its
 * button gradient. Small and calm on purpose - a compact swatch per theme keeps the whole collection easy to scan.
 */
const ThemeSwatch = memo(function ThemeSwatch({ item, selected, width, onPress }: { item: Theme; selected: boolean; width: number; onPress: () => void }) {
  const t = useTheme();
  const h = Math.round(width * 0.82);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} theme, ${item.dark ? 'dark' : 'light'}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({ width, transform: [{ scale: pressed ? 0.96 : 1 }] })}
    >
      <View
        style={{
          height: h,
          borderRadius: 18,
          overflow: 'hidden',
          borderWidth: selected ? 2.5 : 1,
          borderColor: selected ? item.primary : item.dark ? 'rgba(255,255,255,0.16)' : 'rgba(16,24,40,0.1)',
          backgroundColor: item.bg[0],
          ...(selected ? elevation(2, item.primary) : null),
        }}
      >
        <LinearGradient colors={item.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 9, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Text style={{ color: item.text, fontSize: 18, fontWeight: '900', letterSpacing: -0.5 }}>Aa</Text>
            {selected ? (
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: item.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
            ) : (
              <Ionicons name={item.dark ? 'moon' : 'sunny'} size={12} color={item.textMuted} style={{ marginTop: 2 }} />
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {item.palette.map((c, i) => (
              <View key={i} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} />
            ))}
          </View>
          <LinearGradient colors={item.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 11, borderRadius: 6 }} />
        </LinearGradient>
      </View>
      <Text numberOfLines={1} style={{ marginTop: 6, textAlign: 'center', fontSize: 11.5, fontWeight: selected ? '800' : '600', color: selected ? t.text : t.textMuted }}>
        {item.name}
      </Text>
    </Pressable>
  );
});

/** Settings > Post Processing: one master switch plus the list of effects (so more can be added later). */
const PostProcessingSection = () => {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const pf = usePostFxSettings();
  const TINT = '#8B5CF6';
  const onCount = POST_FX_EFFECTS.filter((e) => !pf.off.includes(e.id)).length;
  return (
    <SettingsSection tint={TINT} icon="color-wand-outline" title="Post Processing" badge={pf.enabled ? `${onCount} of ${POST_FX_EFFECTS.length} on` : 'Off'} hint="3D scene look">
      <Pressable
        onPress={() => {
          haptic.select();
          setPostFxSettings({ enabled: !pf.enabled });
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: pf.enabled }}
        accessibilityLabel="Post processing"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: pf.enabled ? hexToRgba(TINT, 0.1) : t.bg[0], borderWidth: pf.enabled ? 1.5 : 1, borderColor: pf.enabled ? TINT : t.border }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: '900', fontSize: 14.5 }}>Post Processing</Text>
          <Text style={{ color: t.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>{pf.enabled ? 'On: effects are drawn over the 3D scene' : 'Off: the plain 3D scene, fastest on older phones'}</Text>
        </View>
        <View style={{ width: 50, height: 30, borderRadius: 15, padding: 3, backgroundColor: pf.enabled ? TINT : hexToRgba(t.textMuted, 0.3), justifyContent: 'center' }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignSelf: pf.enabled ? 'flex-end' : 'flex-start' }} />
        </View>
      </Pressable>
      <View style={{ marginTop: 10, gap: 10, opacity: pf.enabled ? 1 : 0.45 }} pointerEvents={pf.enabled ? 'auto' : 'none'}>
        {POST_FX_EFFECTS.map((e) => (
          <SettingsTile
            key={e.id}
            width={Math.min(width, 720) - 36 - 2 - 32}
            tint={TINT}
            on={!pf.off.includes(e.id)}
            icon={e.icon}
            label={e.label}
            caption={e.caption}
            onPress={() => setPostFxSettings({ off: pf.off.includes(e.id) ? pf.off.filter((x) => x !== e.id) : [...pf.off, e.id] })}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <Ionicons name="information-circle-outline" size={16} color={t.textMuted} />
        <Text style={{ flex: 1, color: t.textMuted, fontSize: 11.5, lineHeight: 16 }}>Used by scenes with glowing light. Older scenes are not affected. A scene switches it off by itself if the phone is too slow.</Text>
      </View>
    </SettingsSection>
  );
};

const SettingsSheet = ({
  visible,
  themeId,
  setThemeId,
  onClose,
  platforms,
  disabledPlatforms,
  setDisabledPlatforms,
  angles,
  setAngles,
  quality,
  setQuality,
  onTour,
}: {
  visible: boolean;
  themeId: string;
  setThemeId: (id: string) => void;
  onClose: () => void;
  platforms: PlatformSpec[];
  disabledPlatforms: string[];
  setDisabledPlatforms: (v: string[]) => void;
  angles: CloudAngle[];
  setAngles: (v: CloudAngle[]) => void;
  quality: SceneQuality;
  setQuality: (v: SceneQuality) => void;
  onTour: () => void;
}) => {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<'all' | 'light' | 'dark'>('all');
  const [showAllThemes, setShowAllThemes] = useState(false);
  const all = useMemo(() => THEME_LIST(), []);
  const list = useMemo(() => all.filter((x) => (filter === 'all' ? true : filter === 'dark' ? x.dark : !x.dark)), [all, filter]);
  const activeId = resolveTheme(themeId).id;
  const current = useMemo(() => all.find((x) => x.id === activeId) ?? all[0], [all, activeId]);
  // measured from the real scroll area (not the window); minus section border + padding
  const [boxW, setBoxW] = useState(0);
  const innerW = (boxW || Math.min(width, 720) - 36) - 2 - 32;
  const GAP = 12;
  const tileCols = 2;
  const tileW = Math.floor((innerW - GAP * (tileCols - 1)) / tileCols);
  const angleCols = innerW >= 560 ? 4 : 2;
  const angleW = Math.floor((innerW - GAP * (angleCols - 1)) / angleCols);
  const swatchCols = innerW >= 560 ? 5 : innerW >= 380 ? 4 : 3;
  const swatchGap = 10;
  const swatchW = Math.floor((innerW - swatchGap * (swatchCols - 1)) / swatchCols);
  const collapsedCount = swatchCols * 3;
  const shown = showAllThemes ? list : list.slice(0, collapsedCount);
  const hiddenCount = Math.max(0, list.length - collapsedCount);
  const count = (f: 'light' | 'dark') => all.filter((x) => (f === 'dark' ? x.dark : !x.dark)).length;
  const selected = platforms.length - platforms.filter((p) => disabledPlatforms.includes(p.name)).length;
  // Angles the user ticked (the always-on 'scene' is not counted and has no switch).
  const pickedAngles = angles.filter((a) => !ALWAYS_ON_ANGLES.includes(a)).length;
  const toggle = (name: string) => setDisabledPlatforms(disabledPlatforms.includes(name) ? disabledPlatforms.filter((n) => n !== name) : [...disabledPlatforms, name]);
  const allPill = (tint: string, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(tint, 0.14) }}>
      <Text style={{ color: tint, fontWeight: '800', fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
  const ANGLE_TINT = t.accent;
  const THEME_TINT = '#F59E0B';
  const heroW = Math.min(168, Math.floor(innerW * 0.46));
  const FILTERS: { id: 'all' | 'light' | 'dark'; label: string; icon: IconName }[] = [
    { id: 'all', label: `All ${all.length}`, icon: 'apps-outline' },
    { id: 'light', label: `Light ${count('light')}`, icon: 'sunny-outline' },
    { id: 'dark', label: `Dark ${count('dark')}`, icon: 'moon-outline' },
  ];
  return (
    <SheetModal visible={visible} title="Settings" onClose={onClose} maxContentWidth={760}>
      <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }} onLayout={(e) => setBoxW(Math.floor(e.nativeEvent.layout.width))}>
        {/* Welcome tour: a bold gradient banner */}
        <Pressable onPress={onTour} accessibilityRole="button" style={{ marginBottom: 16 }}>
          <LinearGradient colors={t.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 24, ...elevation(2, t.cta[0]) }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.25)' }}>
              <Ionicons name="play" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15.5 }}>Welcome tour</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>A 3-step intro to Magic 3D Studio</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>

        {/* Platforms to generate */}
        {/* 3D Agents Mode: Standard (1 credit) or Advanced (2 credits, two-stage agent) */}
        <SettingsSection tint={t.accent} icon="sparkles-outline" title="3D Agents Mode" badge={`${sceneQualityCost(quality)} ${sceneQualityCost(quality) === 1 ? 'credit' : 'credits'}`} hint="Per 3D scene">
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {SCENE_QUALITIES.map((q) => {
              const on = quality === q.id;
              return (
                <Pressable
                  key={q.id}
                  onPress={() => {
                    haptic.select();
                    setQuality(q.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{ flex: 1, minHeight: 104, padding: 12, borderRadius: 18, backgroundColor: on ? hexToRgba(t.accent, 0.12) : t.bg[0], borderWidth: on ? 1.5 : 1, borderColor: on ? t.accent : t.border }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : hexToRgba(t.textMuted, 0.14) }}>
                      <Ionicons name={q.icon} size={17} color={on ? '#fff' : t.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: t.text, fontWeight: '900', fontSize: 14 }}>{q.label}</Text>
                      <Text style={{ color: on ? t.accent : t.textMuted, fontWeight: '800', fontSize: 11.5 }}>{q.credits} {q.credits === 1 ? 'credit' : 'credits'}</Text>
                    </View>
                    <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: hexToRgba(t.textMuted, 0.5) }}>
                      {on && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                  </View>
                  <Text style={{ color: t.textMuted, fontSize: 11, lineHeight: 15, marginTop: 8 }}>{q.caption}</Text>
                </Pressable>
              );
            })}
          </View>
        </SettingsSection>

        {/* Post processing: effects drawn over the generated 3D page (only newer pages use them) */}
        <PostProcessingSection />

        <SettingsSection
          tint={t.primary}
          icon="storefront-outline"
          title="Platform images"
          badge={`${selected} of ${platforms.length} on`}
          hint="Made on your phone"
          action={allPill(t.primary, selected === platforms.length ? 'None' : 'All', () => setDisabledPlatforms(selected === platforms.length ? platforms.map((p) => p.name) : []))}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 10 }}>
            {platforms.map((p) => (
              <SettingsTile key={p.name} width={tileW} tint={t.primary} on={!disabledPlatforms.includes(p.name)} icon={platformGlyph(p.name)} label={p.name} caption={`${p.width} × ${p.height}`} onPress={() => toggle(p.name)} />
            ))}
          </View>
        </SettingsSection>

        {/* Multi product angles (cloud). 'scene' is always on and has no switch here. */}
        <SettingsSection
          tint={ANGLE_TINT}
          icon="cube-outline"
          title="Multi Product Angles"
          badge={`${pickedAngles} of ${SETTINGS_ANGLES.length} on`}
          hint="Made by the cloud"
          action={allPill(ANGLE_TINT, pickedAngles === SETTINGS_ANGLES.length ? 'None' : 'All', () => setAngles(pickedAngles === SETTINGS_ANGLES.length ? [] : SETTINGS_ANGLES.map((a) => a.id)))}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 10 }}>
            {SETTINGS_ANGLES.map((a) => (
              <SettingsTile key={a.id} width={angleW} tint={ANGLE_TINT} on={angles.includes(a.id)} icon={a.icon} label={a.label} onPress={() => setAngles(angles.includes(a.id) ? angles.filter((x) => x !== a.id) : [...angles, a.id])} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <Ionicons name="information-circle-outline" size={16} color={t.textMuted} />
            <Text style={{ flex: 1, color: t.textMuted, fontSize: 11.5, lineHeight: 16 }}>A Scene image is always included. Each image appears in Product Views as soon as it is ready.</Text>
          </View>
        </SettingsSection>

        {/* Themes */}
        <SettingsSection tint={THEME_TINT} icon="color-palette-outline" title="Theme" badge={`${all.length} looks`} hint="Applies instantly">
          {/* the look that is on right now */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, borderRadius: 20, backgroundColor: t.bg[0], borderWidth: 1, borderColor: t.border }}>
            <ThemeCard item={current} selected={false} width={heroW} onPress={() => undefined} />
            <View style={{ flex: 1, gap: 6, paddingBottom: 12 }}>
              <Text style={{ color: THEME_TINT, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8 }}>CURRENT LOOK</Text>
              <Text numberOfLines={2} style={{ color: t.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.3 }}>{current.name}</Text>
              <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 24, borderRadius: 12, backgroundColor: hexToRgba(t.textMuted, 0.14) }}>
                <Ionicons name={current.dark ? 'moon' : 'sunny'} size={12} color={t.textMuted} />
                <Text style={{ color: t.textMuted, fontSize: 11.5, fontWeight: '800' }}>{current.dark ? 'Dark' : 'Light'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                {current.palette.map((c, i) => (
                  <View key={i} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c, borderWidth: 1.5, borderColor: t.surface }} />
                ))}
              </View>
            </View>
          </View>

          {/* segmented filter */}
          <View style={{ flexDirection: 'row', padding: 3, borderRadius: 16, marginTop: 16, marginBottom: 14, backgroundColor: hexToRgba(t.textMuted, 0.12) }}>
            {FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => {
                    haptic.select();
                    setFilter(f.id);
                    setShowAllThemes(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{ flex: 1, height: 36, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: on ? t.surface : 'transparent', ...(on ? elevation(1, '#1b1640') : null) }}
                >
                  <Ionicons name={f.icon} size={15} color={on ? t.primary : t.textMuted} />
                  <Text style={{ color: on ? t.text : t.textMuted, fontWeight: on ? '800' : '600', fontSize: 12.5 }}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* calm swatch grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: swatchGap, rowGap: 14 }}>
            {shown.map((item) => (
              <ThemeSwatch
                key={item.id}
                item={item}
                selected={item.id === activeId}
                width={swatchW}
                onPress={() => {
                  haptic.select();
                  setThemeId(item.id);
                }}
              />
            ))}
          </View>

          {hiddenCount > 0 && (
            <Pressable
              onPress={() => {
                haptic.select();
                setShowAllThemes((v) => !v);
              }}
              accessibilityRole="button"
              style={{ marginTop: 16, height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: hexToRgba(THEME_TINT, 0.14) }}
            >
              <Text style={{ color: THEME_TINT, fontWeight: '800', fontSize: 14 }}>{showAllThemes ? 'Show fewer' : `Show ${hiddenCount} more`}</Text>
              <Ionicons name={showAllThemes ? 'chevron-up' : 'chevron-down'} size={16} color={THEME_TINT} />
            </Pressable>
          )}
        </SettingsSection>
      </ScrollView>
    </SheetModal>
  );
};

/* ============================================================================
 * 13b. LIBRARY (saved scenes + harmonized photos) and SHARE KIT
 * ========================================================================== */

type LibraryKind = 'scene' | 'harmonized';
type LibraryItem = { id: string; kind: LibraryKind; title: string; prompt: string; created: number; favorite: boolean; thumb: string };
/** What is needed to re-open an item. Kept in its own column so the list query stays light. */
/** One step of a scene's Retouch history (Original, Retouch 1, ...). Files live in the item's own folder. */
type SceneVersion = { label: string; created: number; thumb?: string; htmlPath?: string; specPath?: string };
/** The names a generation was made with (enough to build the Retouch file names later). */
type SavedSceneNames = { base: string; key: string; angles: CloudAngle[]; htmlFile: string; specFile: string };
type ScenePayload = {
  html: string;
  asset: { id: string; views: Record<ViewLabel, string>; metadata: ProductMetadata; /** the cut-out (transparent PNG): the platform images are re-made from it. Missing on older items. */ clean?: string };
  /** cloud angle + scene images that had arrived */
  cloud?: Partial<Record<CloudAngle, string>>;
  /** the page and its scene spec (.json), kept as files next to the item; specPath is missing when the cloud never produced one */
  htmlPath?: string;
  specPath?: string;
  /** a Retouched item also keeps the page it was made from, for the before / after compare */
  beforeHtmlPath?: string;
  /** Retouch history, oldest first, the last one is this item's own page. Missing on items that were never retouched. */
  versions?: SceneVersion[];
  names?: SavedSceneNames;
};
type HarmonizedPayload = { beforeUri: string; afterUri: string };

const memLibrary = new Map<string, { item: LibraryItem; payload: string }>();
let libraryReady: Promise<SqliteDb | null> | null = null;
function libraryDb(): Promise<SqliteDb | null> {
  if (!libraryReady) {
    libraryReady = (async () => {
      const db = await openDb();
      if (!db) return null;
      try {
        await db.execAsync(
          'CREATE TABLE IF NOT EXISTS library (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL, created INTEGER NOT NULL, favorite INTEGER NOT NULL DEFAULT 0, thumb TEXT NOT NULL, payload TEXT NOT NULL);',
        );
        return db;
      } catch (e) {
        console.error('[Magic3DStudio] library table failed - memory only', e);
        return null;
      }
    })();
  }
  return libraryReady;
}
const rowToItem = (r: { id: string; kind: string; title: string; prompt: string; created: number; favorite: number; thumb: string }): LibraryItem => ({
  id: r.id,
  kind: r.kind === 'harmonized' ? 'harmonized' : 'scene',
  title: r.title,
  prompt: r.prompt,
  created: r.created,
  favorite: !!r.favorite,
  thumb: r.thumb,
});
async function libraryList(): Promise<LibraryItem[]> {
  const db = await libraryDb();
  if (!db) return [...memLibrary.values()].map((v) => v.item).sort((a, b) => b.created - a.created);
  try {
    const rows = await db.getAllAsync<any>('SELECT id, kind, title, prompt, created, favorite, thumb FROM library ORDER BY created DESC');
    return rows.map(rowToItem);
  } catch (e) {
    console.error('[Magic3DStudio] library list failed', e);
    return [];
  }
}
async function librarySave(item: LibraryItem, payload: ScenePayload | HarmonizedPayload): Promise<void> {
  const json = JSON.stringify(payload);
  memLibrary.set(item.id, { item, payload: json });
  const db = await libraryDb();
  if (!db) return;
  try {
    await db.runAsync('INSERT OR REPLACE INTO library (id, kind, title, prompt, created, favorite, thumb, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.kind, item.title, item.prompt, item.created, item.favorite ? 1 : 0, item.thumb, json);
  } catch (e) {
    console.error('[Magic3DStudio] library save failed', e);
  }
}
async function libraryPayload<T>(id: string): Promise<T | null> {
  const db = await libraryDb();
  try {
    if (db) {
      const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM library WHERE id = ?', id);
      if (row) return JSON.parse(row.payload) as T;
    }
  } catch (e) {
    console.error('[Magic3DStudio] library read failed', e);
  }
  const m = memLibrary.get(id);
  return m ? (JSON.parse(m.payload) as T) : null;
}
/** Reads a saved text file; null when the path is missing, the file is gone or empty. */
async function readTextFile(path?: string): Promise<string | null> {
  if (!path) return null;
  try {
    const f = new File(path);
    if (!f.exists) return null;
    const text = await f.text();
    return text.trim() ? text : null;
  } catch (e) {
    console.warn('[Magic3DStudio] could not read', path, e);
    return null;
  }
}
/** The page of a saved scene: read from its saved file (htmlPath); falls back to the copy in the payload when the file is missing. */
async function readSavedHtml(p: ScenePayload): Promise<string> {
  try {
    if (p.htmlPath) {
      const f = new File(p.htmlPath);
      if (f.exists) {
        const text = await f.text();
        if (text.trim()) return text;
      }
    }
  } catch (e) {
    console.warn('[Magic3DStudio] could not read the saved page file - using the stored copy', e);
  }
  return p.html;
}
/** Merges fields into an item's saved payload (e.g. the scene spec that arrives after the page was saved). */
async function libraryPatchPayload(id: string, patch: Partial<ScenePayload>): Promise<void> {
  const cur = await libraryPayload<ScenePayload>(id);
  if (!cur) return;
  const next = JSON.stringify({ ...cur, ...patch });
  const m = memLibrary.get(id);
  if (m) m.payload = next;
  const db = await libraryDb();
  try {
    await db?.runAsync('UPDATE library SET payload = ? WHERE id = ?', next, id);
  } catch (e) {
    console.error('[Magic3DStudio] library patch failed', e);
  }
}
async function libraryUpdate(id: string, patch: { title?: string; favorite?: boolean }): Promise<void> {
  const m = memLibrary.get(id);
  if (m) m.item = { ...m.item, ...patch };
  const db = await libraryDb();
  if (!db) return;
  try {
    if (patch.title !== undefined) await db.runAsync('UPDATE library SET title = ? WHERE id = ?', patch.title, id);
    if (patch.favorite !== undefined) await db.runAsync('UPDATE library SET favorite = ? WHERE id = ?', patch.favorite ? 1 : 0, id);
  } catch (e) {
    console.error('[Magic3DStudio] library update failed', e);
  }
}
async function libraryDelete(id: string): Promise<void> {
  memLibrary.delete(id);
  try {
    const d = new Directory(Paths.document, 'magic3d', id);
    if (d.exists) d.delete();
  } catch (e) {
    console.warn('[Magic3DStudio] could not delete the item files', e);
  }
  const db = await libraryDb();
  try {
    await db?.runAsync('DELETE FROM library WHERE id = ?', id);
  } catch (e) {
    console.error('[Magic3DStudio] library delete failed', e);
  }
}

/** Down-scales any image uri to a self-contained data URI that survives app restarts. */
async function toStorableUri(uri: string, maxSide: number, fmt: 'png' | 'jpeg' = 'png'): Promise<string> {
  const img = await loadSkImage(uri);
  const k = Math.min(1, maxSide / Math.max(img.width(), img.height()));
  const w = Math.max(1, Math.round(img.width() * k));
  const h = Math.max(1, Math.round(img.height() * k));
  const out = renderToImage(w, h, (c) => {
    if (fmt === 'jpeg') c.drawColor(Skia.Color('#FFFFFF')); // JPEG has no alpha
    drawImageSmooth(c, img, fullRect(img), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  });
  return `data:image/${fmt};base64,${out.encodeToBase64(fmt === 'jpeg' ? ImageFormat.JPEG : ImageFormat.PNG, fmt === 'jpeg' ? 86 : 100)}`;
}

const utf8Bytes = (str: string): Uint8Array => {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  const bin = unescape(encodeURIComponent(str));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * "Share kit": ONE zip with everything for an item - the images, a ready-to-print A4 PDF and (for scenes) the Three.js
 * page. Scenes will also carry the exported video once the recorder is wired (TODO below).
 */
async function buildShareKit(item: LibraryItem): Promise<string> {
  const slug = displayTitle(item).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 28) || 'magic3d';
  const files: string[] = [];
  const pdfImgs: { label: string; uri: string }[] = [];
  const esc = (x: string) => x.replace(/[<>&]/g, '');
  if (item.kind === 'harmonized') {
    const p = await libraryPayload<HarmonizedPayload>(item.id);
    if (!p) throw new Error('This item is no longer available');
    files.push(await ensureFileUri(p.afterUri, `${slug}_after`), await ensureFileUri(p.beforeUri, `${slug}_before`));
    pdfImgs.push({ label: 'After', uri: p.afterUri }, { label: 'Before', uri: p.beforeUri });
  } else {
    const p = await libraryPayload<ScenePayload>(item.id);
    if (!p) throw new Error('This item is no longer available');
    for (const l of VIEW_ORDER) {
      files.push(await ensureFileUri(p.asset.views[l], `${slug}_${l}`));
      pdfImgs.push({ label: l, uri: p.asset.views[l] });
    }
    if (p.cloud?.scene) {
      files.push(await ensureFileUri(p.cloud.scene, `${slug}_scene`));
      pdfImgs.push({ label: 'scene', uri: p.cloud.scene });
    }
    files.push(writeToFile(`${slug}_scene.html`, utf8Bytes(p.html)));
    // TODO(production): add the exported video here once expo-turbo-screen-recorder is wired:
    //   if (item.videoUri) files.push(item.videoUri);
  }
  console.log('[Magic3DStudio] share kit: images ready, building the PDF');
  const Print = require('expo-print') as typeof import('expo-print');
  const cells = await Promise.all(pdfImgs.map(async (im) => `<div class="c"><img src="${await imageToDataUri(im.uri)}"/><div class="l">${esc(im.label)}</div></div>`));
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page { size: A4; margin: 0; }
    body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #2b2a33; }
    .page { width: 210mm; box-sizing: border-box; padding: 16mm; }
    h1 { font-size: 22px; margin: 0 0 4px; } p { margin: 0 0 12mm; color: #777; font-size: 12px; }
    .g { display: flex; flex-wrap: wrap; gap: 8mm; }
    .c { width: 84mm; background: #fbf9f4; padding: 4mm 4mm 2mm; box-shadow: 0 1px 6px rgba(0,0,0,.18); box-sizing: border-box; }
    .c img { width: 100%; height: 70mm; object-fit: contain; background: #eceff4; }
    .l { text-align: center; padding: 3mm 0 1mm; font-size: 13px; font-weight: 700; text-transform: capitalize; }
  </style></head><body><div class="page"><h1>${esc(displayTitle(item))}</h1><p>${esc(item.prompt || 'Magic 3D Studio')} · ${new Date(item.created).toLocaleDateString()}</p><div class="g">${cells.join('')}</div></div></body></html>`;
  let pdfUri: string | null = null;
  try {
    pdfUri = (await withDeadline(Print.printToFileAsync({ html, width: 595, height: 842 }), 45000, 'Building the PDF')).uri;
  } catch (e) {
    console.warn('[Magic3DStudio] share kit: PDF skipped', e); // the images + page are still worth sharing
  }
  if (pdfUri) files.push(pdfUri);
  console.log(`[Magic3DStudio] share kit: zipping ${files.length} files`);
  return await withDeadline(Promise.resolve(create_zip_from_files(files)), 60000, 'Zipping the files');
}

/**
 * A clean name for a Library item. Older items were titled with the first 30 characters of the prompt (cut mid-word),
 * so a title that is just a prefix of the prompt counts as "auto" and is replaced by a neutral name; the full prompt
 * is shown as the description instead.
 */
const displayTitle = (item: LibraryItem): string => {
  const t = (item.title || '').trim();
  const pr = (item.prompt || '').trim();
  const auto = !t || (item.kind === 'scene' && pr.length > 0 && pr.toLowerCase().startsWith(t.replace(/…$/, '').toLowerCase()));
  if (!auto) return t;
  return item.kind === 'harmonized' ? 'Harmonized photo' : 'Product scene';
};
const sceneTitle = (m: ProductMetadata | undefined): string => {
  const raw = (m?.name || '').trim();
  const cat = m?.category && m.category !== 'generic' ? m.category : '';
  const base = raw && !/^(product|demo|item)/i.test(raw) ? raw : cat;
  if (!base) return 'Product scene';
  const nice = base.length > 24 ? `${base.slice(0, 23).trimEnd()}…` : base;
  return `${nice.charAt(0).toUpperCase()}${nice.slice(1)} scene`;
};

const fmtDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};

/** Short or full "when" label for a Library card: Today / Yesterday / 3 Nov (· 20:38). */
const fmtWhen = (ts: number, short = false): string => {
  const d = new Date(ts);
  const day0 = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day0(new Date()) - day0(d)) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return short ? (diff === 1 ? 'Yest.' : day) : `${day} · ${time}`;
};

/**
 * Every Library card gets its own two-colour accent taken from the active theme's palette, picked from the item id so
 * a card keeps the same colours forever (and neighbours differ even when the product photo is identical).
 */
const libraryAccent = (item: LibraryItem, t: Theme): [string, string] => {
  const key = `${item.kind}:${item.id}`;
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const p = t.palette;
  const i = h % p.length;
  return [p[i], p[(i + 2) % p.length]];
};

/** Small frosted-glass surface for chips and round buttons that sit on top of a photo. */
const LibGlass = ({ children, style, pointerEvents }: { children?: ReactNode; style?: StyleProp<ViewStyle>; pointerEvents?: 'auto' | 'none' }) => (
  <View pointerEvents={pointerEvents} style={[{ overflow: 'hidden', backgroundColor: 'rgba(12,14,26,0.46)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.30)' }, style]}>
    {Platform.OS === 'ios' && <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />}
    {children}
  </View>
);

const LibraryCard = memo(function LibraryCard({
  item,
  width,
  busy,
  onOpen,
  onFavorite,
  onKit,
  onDelete,
  onRename,
  onRetouch,
}: {
  item: LibraryItem;
  width: number;
  busy: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  onKit: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  /** only passed when the backend turned Retouch on */
  onRetouch?: () => void;
}) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const shown = displayTitle(item);
  const [text, setText] = useState(shown);
  const commit = () => {
    setEditing(false);
    const v = text.trim();
    if (v && v !== shown) onRename(v.slice(0, 60));
    else setText(shown);
  };
  const isScene = item.kind === 'scene';
  const [a, b] = useMemo(() => libraryAccent(item, t), [item, t]);
  const FAV = '#FF4D6D';
  const R = 24;
  const bodyTint = mixHex(t.surface, a, t.dark ? 0.14 : 0.07);

  return (
    // outer view carries the (accent-coloured) shadow, inner view clips the content to the rounded corners
    <View style={{ width, borderRadius: R, backgroundColor: t.surface, ...elevation(2, a) }}>
      <View style={{ borderRadius: R, overflow: 'hidden', borderWidth: 1, borderColor: item.favorite ? hexToRgba(FAV, 0.55) : hexToRgba(a, t.dark ? 0.4 : 0.24) }}>
        {/* ---------- photo stage ---------- */}
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${shown}`} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
          <View style={{ height: Math.round(width * 1.02), backgroundColor: mixHex(t.stageBg[0], a, 0.2) }}>
            <Image source={{ uri: item.thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {/* colour wash: tints the photo with this card's two accent colours */}
            <LinearGradient pointerEvents="none" colors={[hexToRgba(a, 0.42), hexToRgba(a, 0.0), hexToRgba(b, 0.0), hexToRgba(b, 0.5)]} locations={[0, 0.38, 0.6, 1]} style={StyleSheet.absoluteFill} />
            {/* soft dark scrim so the chips at the bottom stay readable */}
            <LinearGradient pointerEvents="none" colors={['rgba(8,10,22,0)', 'rgba(8,10,22,0.55)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%' }} />
            {/* thin accent line along the top edge */}
            <LinearGradient pointerEvents="none" colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3 }} />

            {/* type badge */}
            <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 12, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', ...elevation(1, a) }}>
              <Ionicons name={isScene ? 'cube' : 'color-wand'} size={11} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }}>{isScene ? '3D' : 'PHOTO'}</Text>
            </LinearGradient>

            {/* date chip (short when the Retouch button needs the room) */}
            <View pointerEvents="box-none" style={{ position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <LibGlass style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 9, borderRadius: 13 }}>
              <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.92)" />
              <Text numberOfLines={1} style={{ color: '#fff', fontSize: 10.5, fontWeight: '700' }}>{fmtWhen(item.created, !!(isScene && onRetouch))}</Text>
            </LibGlass>

            {isScene && onRetouch ? (
              <Pressable onPress={onRetouch} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retouch this scene" style={{ flexShrink: 0 }}>
                <LinearGradient colors={t.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', ...elevation(3, t.cta[0]) }}>
                  <Ionicons name="sparkles" size={13} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.3 }}>Retouch</Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <LibGlass pointerEvents="none" style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={isScene ? 'expand-outline' : 'eye-outline'} size={14} color="#fff" />
              </LibGlass>
            )}
            </View>
          </View>
        </Pressable>

        {/* favourite: frosted when off, solid white with a pink heart when on */}
        <Pressable onPress={onFavorite} hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: item.favorite }} accessibilityLabel="Favourite" style={{ position: 'absolute', top: 10, right: 10 }}>
          {item.favorite ? (
            <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', ...elevation(2, FAV) }}>
              <Ionicons name="heart" size={18} color={FAV} />
            </View>
          ) : (
            <LibGlass style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="heart-outline" size={18} color="#fff" />
            </LibGlass>
          )}
        </Pressable>

        {/* ---------- details + actions ---------- */}
        <LinearGradient colors={[t.surface, bodyTint]} style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 }}>
          {editing ? (
            <TextInput value={text} onChangeText={setText} autoFocus onBlur={commit} onSubmitEditing={commit} maxLength={60} returnKeyType="done" style={{ color: t.text, fontSize: 14.5, fontWeight: '800', paddingVertical: 0, borderBottomWidth: 1.5, borderColor: a }} />
          ) : (
            <Pressable onPress={() => setEditing(true)} accessibilityLabel="Rename" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.1 }}>
                {shown}
              </Text>
              <Ionicons name="pencil" size={11} color={t.textMuted} style={{ opacity: 0.55 }} />
            </Pressable>
          )}
          {!!item.prompt?.trim() && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <LinearGradient colors={[a, b]} style={{ width: 3, borderRadius: 2 }} />
              <Text numberOfLines={2} ellipsizeMode="tail" style={{ flex: 1, color: t.textMuted, fontSize: 11.5, lineHeight: 16, fontStyle: 'italic' }}>
                {item.prompt.trim()}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <Pressable onPress={onKit} disabled={busy} accessibilityRole="button" accessibilityLabel="Share kit" style={({ pressed }) => ({ flex: 1, opacity: pressed || busy ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 38, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, ...elevation(1, a) }}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="gift" size={14} color="#fff" />}
                <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2 }}>Share kit</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Delete" style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: hexToRgba(t.danger, 0.3), backgroundColor: hexToRgba(t.danger, pressed ? 0.22 : 0.1) })}>
              <Ionicons name="trash-outline" size={17} color={t.danger} />
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
});

/**
 * Shown over the Library sheet the instant Retouch is tapped, until the sheet closes: the scene is being read, the credit is
 * being reserved and the preview is being prepared, which takes a few seconds. The card's picture sits in a spinning gradient
 * ring with orbiting sparkles, a rotating status line and a sweeping progress bar, so it never looks like nothing happened.
 */
const RETOUCH_PREP_MESSAGES = ['Opening your 3D scene', 'Reserving your credit', 'Preparing the retouch', 'Getting the canvas ready'];
const RetouchPrepOverlay = memo(function RetouchPrepOverlay({ thumb }: { thumb?: string }) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;
  const msgFade = useRef(new Animated.Value(1)).current;
  const [msgIdx, setMsgIdx] = useState(0);
  const [barW, setBarW] = useState(0);
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    if (reduce) return;
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true })])),
      Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [appear, spin, pulse, sweep, reduce]);
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(msgFade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        setMsgIdx((i) => (i + 1) % RETOUCH_PREP_MESSAGES.length);
        Animated.timing(msgFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }, 1400);
    return () => clearInterval(id);
  }, [msgFade]);
  const SIZE = 132;
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counter = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const dark = t.dark;
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Preparing the retouch"
      style={{ ...StyleSheet.absoluteFill, opacity: appear, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: RADIUS.xxl + 2, borderTopRightRadius: RADIUS.xxl + 2, overflow: 'hidden', zIndex: 50, elevation: 50 }}
    >
      <LinearGradient colors={dark ? ['rgba(10,12,24,0.94)', 'rgba(10,12,24,0.97)'] : ['rgba(255,255,255,0.95)', 'rgba(247,244,240,0.98)']} style={StyleSheet.absoluteFill} />
      {/* soft breathing glow */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', width: SIZE * 2.1, height: SIZE * 2.1, borderRadius: SIZE * 1.05, backgroundColor: hexToRgba(t.primary, dark ? 0.16 : 0.12), opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) }] }} />
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        {/* spinning gradient ring */}
        <Animated.View style={{ position: 'absolute', width: SIZE, height: SIZE, transform: [{ rotate: rot }] }}>
          <LinearGradient colors={[t.primary, t.accent, hexToRgba(t.accent, 0), hexToRgba(t.primary, 0.1), t.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: SIZE / 2 }} />
        </Animated.View>
        {/* picture of the scene being retouched */}
        <Animated.View style={{ width: SIZE - 12, height: SIZE - 12, borderRadius: (SIZE - 12) / 2, overflow: 'hidden', backgroundColor: dark ? '#10131F' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.015] }) }] }}>
          {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="cube-outline" size={40} color={t.primary} />}
          <LinearGradient pointerEvents="none" colors={['rgba(8,10,22,0)', 'rgba(8,10,22,0.45)']} style={StyleSheet.absoluteFill} />
          <View style={{ position: 'absolute', bottom: 12, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(t.primary, 0.92), borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' }}>
            <Ionicons name="sparkles" size={17} color="#fff" />
          </View>
        </Animated.View>
        {/* orbiting sparkles */}
        {[0, 1, 2].map((i) => (
          <Animated.View key={i} pointerEvents="none" style={{ position: 'absolute', width: SIZE + 34, height: SIZE + 34, alignItems: 'center', transform: [{ rotate: i === 1 ? counter : rot }, { rotate: `${i * 120}deg` }] }}>
            <Ionicons name="sparkles" size={i === 1 ? 11 : 14} color={i === 2 ? t.accent : t.primary} />
          </Animated.View>
        ))}
      </View>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: '900', letterSpacing: -0.2, marginTop: 30 }}>Starting your Retouch</Text>
      <Animated.Text style={{ color: t.textMuted, fontSize: 13.5, fontWeight: '700', marginTop: 6, opacity: msgFade }}>{RETOUCH_PREP_MESSAGES[msgIdx]}…</Animated.Text>
      {/* sweeping progress bar */}
      <View onLayout={(e) => setBarW(e.nativeEvent.layout.width)} style={{ width: 168, height: 5, borderRadius: 3, marginTop: 18, overflow: 'hidden', backgroundColor: hexToRgba(t.primary, dark ? 0.22 : 0.16) }}>
        {barW > 0 && (
          <Animated.View style={{ width: barW * 0.45, height: 5, borderRadius: 3, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-barW * 0.45, barW] }) }] }}>
            <LinearGradient colors={[t.primary, t.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 3 }} />
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
});

type LibraryFilter = 'all' | 'fav' | 'scene' | 'harmonized';
/** Round gradient "Retouch" button for the 3D canvas, sits left of the Record button. */
const RetouchCanvasButton = ({ size, onPress, busy }: { size: number; onPress: () => void; busy?: boolean }) => {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Retouch this scene"
      hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.93 : 1 }], shadowColor: t.primary, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 6 })}
    >
      <LinearGradient colors={t.cta as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' }}>
        <Ionicons name="color-wand" size={Math.round(size * 0.5)} color="#FFFFFF" />
      </LinearGradient>
    </Pressable>
  );
};

const LibrarySheet = ({ visible, items, loading, onClose, onOpen, onChange, onToast, showRetouch, onRetouch, retouchPrep }: { retouchPrep?: { thumb?: string } | null; visible: boolean; items: LibraryItem[]; loading: boolean; onClose: () => void; onOpen: (item: LibraryItem) => void; onChange: () => void; onToast: (m: string) => void; showRetouch?: boolean; onRetouch?: (item: LibraryItem) => void }) => {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [kitBusy, setKitBusy] = useState<string | null>(null);
  const list = useMemo(() => items.filter((i) => (filter === 'all' ? true : filter === 'fav' ? i.favorite : i.kind === filter)), [items, filter]);
  // measured from the real container so two columns always fit, whatever the sheet padding is
  const [boxW, setBoxW] = useState(0);
  const GAP = 12;
  const cardW = Math.floor(((boxW || width - 36) - GAP) / 2);
  const rows = useMemo(() => {
    const r: LibraryItem[][] = [];
    for (let n = 0; n < list.length; n += 2) r.push(list.slice(n, n + 2));
    return r;
  }, [list]);
  const count = (f: LibraryFilter) => items.filter((i) => (f === 'all' ? true : f === 'fav' ? i.favorite : i.kind === f)).length;

  const kit = async (item: LibraryItem) => {
    if (kitBusy) return;
    setKitBusy(item.id);
    try {
      const zip = await withDeadline(buildShareKit(item), 150000, 'Building the share kit');
      await shareFile(zip, 'application/zip', `${displayTitle(item)} - share kit`);
    } catch (e: any) {
      console.warn('[Magic3DStudio] share kit failed', e);
      onToast(e?.message ? String(e.message) : 'Could not build the share kit');
    } finally {
      setKitBusy(null);
    }
  };
  const remove = (item: LibraryItem) =>
    Alert.alert('Delete from Library?', `${displayTitle(item)} and its images will be removed from this device. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          haptic.warning();
          await libraryDelete(item.id);
          onChange();
        },
      },
    ]);

  return (
    <SheetModal visible={visible} title="Library" onClose={onClose}>
      {/* four equal segments: always one row, whatever the screen width */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        {([
          ['all', 'All', 'albums-outline'],
          ['fav', 'Favs', 'heart-outline'],
          ['scene', 'Scenes', 'film-outline'],
          ['harmonized', 'Photos', 'color-wand-outline'],
        ] as [LibraryFilter, string, IconName][]).map(([f, label, icon]) => {
          const on = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => {
                haptic.tap();
                setFilter(f);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label} ${count(f)}`}
              style={{ flex: 1, minHeight: 40, borderRadius: 20, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: on ? t.primary : t.surface, borderWidth: 1, borderColor: on ? t.primary : t.border }}
            >
              <Ionicons name={icon} size={14} color={on ? '#fff' : t.text} />
              <Text numberOfLines={1} style={{ color: on ? '#fff' : t.text, fontSize: 12, fontWeight: '800' }}>
                {label}
              </Text>
              <View style={{ minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? 'rgba(255,255,255,0.28)' : hexToRgba(t.primary, 0.12) }}>
                <Text style={{ color: on ? '#fff' : t.primary, fontSize: 10.5, fontWeight: '800' }}>{count(f)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {loading && items.length === 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 8, paddingHorizontal: 4 }} accessibilityLabel="Loading your library">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: '48%', marginBottom: SP.md }}>
              <Skeleton width="100%" height={140} radius={RADIUS.lg} />
              <Skeleton width="70%" height={12} radius={6} style={{ marginTop: SP.sm }} />
            </View>
          ))}
        </View>
      ) : list.length === 0 ? (
        <EmptyState
          icon={filter === 'fav' ? 'heart-outline' : 'albums-outline'}
          title={filter === 'fav' ? 'No favourites yet' : 'Nothing saved yet'}
          body={filter === 'fav' ? 'Tap the heart on a card to keep it here.' : 'Scenes you generate and photos you harmonize are saved here automatically.'}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }} onLayout={(e) => setBoxW(Math.floor(e.nativeEvent.layout.width))}>
          {rows.map((row) => (
            <View key={row[0].id} style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
              {row.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              width={cardW}
              busy={kitBusy === item.id}
              onOpen={() => onOpen(item)}
              onRetouch={showRetouch && onRetouch ? () => onRetouch(item) : undefined}
              onFavorite={async () => {
                haptic.tap();
                await libraryUpdate(item.id, { favorite: !item.favorite });
                onChange();
              }}
              onKit={() => kit(item)}
              onDelete={() => remove(item)}
              onRename={async (title) => {
                await libraryUpdate(item.id, { title });
                onChange();
              }}
            />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
      {retouchPrep ? <RetouchPrepOverlay thumb={retouchPrep.thumb} /> : null}
    </SheetModal>
  );
};

/* ============================================================================
 * 13c. FIRST-RUN: welcome tour, credit explainer
 * ========================================================================== */

const TOUR_SLIDES: { icon: IconName; title: string; body: string; chips: string[] }[] = [
  { icon: 'image-outline', title: 'Pick a photo', body: 'Choose a photo or take one. We generate beautiful e-commerce photos and 3D scene from a single image.', chips: ['Gallery', 'Camera', 'E-commerce photos'] },
  { icon: 'create-outline', title: 'Describe your scene', body: 'Say where it should be, like "floating on a table in a modern living room", and pick a look you love.', chips: ['Your words', `${THEME_COUNT} themes`] },
  { icon: 'cube-outline', title: 'Get your 3D result', body: 'Watch your product come alive, record a video, blend it into your own photo with Harmonize, or share a kit.', chips: ['Record', 'Harmonize', 'Share kit'] },
];

/** Used when the user leaves the scene description empty. */
const TOUR_HINT = 'Show this product with a beautiful backdrop, high quality e-commerce video ad';
type TourResult = { uri?: string; prompt: string };

/**
 * First-run tour that actually does the work: step 1 opens the image picker, step 2 takes the scene description
 * (the suggestion is used when it is left empty) and step 3 starts the demo (MOCK) or the real generation (PRODUCTION).
 * It keeps its state while the picker is open, and only starts over when `sessionKey` changes.
 */
const WelcomeTour = ({
  visible,
  sessionKey,
  mock,
  onClose,
  pickImage,
  onFinish,
}: {
  visible: boolean;
  sessionKey: number;
  mock: boolean;
  onClose: () => void;
  pickImage: () => Promise<string | null>;
  onFinish: (r: TourResult) => void;
}) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const x = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [picking, setPicking] = useState(false);
  const [kbH, setKbH] = useState(0);
  const last = index === TOUR_SLIDES.length - 1;
  const indexRef = useRef(0);
  indexRef.current = index;

  // a brand-new session starts from scratch; re-showing after the picker keeps everything
  useEffect(() => {
    setIndex(0);
    setPhoto(null);
    setPromptText('');
    x.setValue(0);
  }, [sessionKey, x]);
  useEffect(() => {
    if (!visible) return;
    x.setValue(indexRef.current * width);
    const id = setTimeout(() => pager.current?.scrollTo({ x: indexRef.current * width, animated: false }), 60);
    return () => clearTimeout(id);
  }, [visible, width, x]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const goTo = (i: number) => pager.current?.scrollTo({ x: i * width, animated: true });
  const choosePhoto = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const uri = await pickImage();
      if (uri) {
        setPhoto(uri);
        haptic.success();
        setTimeout(() => goTo(1), 250);
      }
    } finally {
      setPicking(false);
    }
  };
  const next = () => {
    haptic.tap();
    Keyboard.dismiss();
    if (index === 0 && !photo) return void choosePhoto(); // step 1: open the image picker
    if (last) return onFinish({ uri: photo ?? undefined, prompt: promptText.trim() || TOUR_HINT });
    goTo(index + 1);
  };
  const label = index === 0 && !photo ? 'Choose a photo' : last ? 'Get started' : 'Next';
  const btnIcon: IconName = index === 0 && !photo ? 'images-outline' : last ? 'sparkles' : 'arrow-forward';
  // generous bottom space: clear of the system navigation bar and any tab bar drawn under the modal
  const bottomPad = kbH > 0 ? kbH + 12 : Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 20) + 36;
  const effectivePrompt = promptText.trim() || TOUR_HINT;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <LinearGradient colors={t.bg} style={{ flex: 1, paddingTop: Math.max(insets.top, 24) + 6, paddingBottom: bottomPad }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, height: 36 }}>
          <Text style={{ color: t.textMuted, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>WELCOME · STEP {index + 1} OF {TOUR_SLIDES.length}</Text>
          {!last && (
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: 14 }}>Skip</Text>
            </Pressable>
          )}
        </View>
        <Animated.ScrollView
          ref={pager as any}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: false })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {TOUR_SLIDES.map((sl, i) => {
            const input = [(i - 1) * width, i * width, (i + 1) * width];
            const scale = x.interpolate({ inputRange: input, outputRange: [0.7, 1, 0.7], extrapolate: 'clamp' });
            const fade = x.interpolate({ inputRange: input, outputRange: [0, 1, 0], extrapolate: 'clamp' });
            const size = Math.min(210, height * 0.27) * (i === 0 ? 1 : 0.62);
            const showPhoto = i === 0 && !!photo;
            const body = i === 2 ? (mock ? 'Tap Get started to play a demo scene and see what Magic 3D Studio can do.' : 'Tap Get started and we will turn your photo into a 3D scene. It only takes a moment.') : sl.body;
            return (
              <ScrollView key={sl.title} style={{ width }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 6 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Animated.View style={{ transform: [{ scale }], opacity: fade, marginBottom: i === 0 ? 30 : 18 }}>
                  <View style={{ width: size + 50, height: size + 50, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ position: 'absolute', width: size + 50, height: size + 50, borderRadius: (size + 50) / 2, backgroundColor: hexToRgba(t.primary, 0.1) }} />
                    <View style={{ position: 'absolute', width: size + 20, height: size + 20, borderRadius: (size + 20) / 2, backgroundColor: hexToRgba(t.accent, 0.14) }} />
                    <LinearGradient colors={[t.cta[0], t.primary, t.cta[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size * 0.3, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', overflow: 'hidden', ...elevation(3, t.primary) }}>
                      {showPhoto ? (
                        <Image source={{ uri: photo! }} style={{ width: size, height: size }} resizeMode="cover" />
                      ) : (
                        <>
                          <View pointerEvents="none" style={{ position: 'absolute', top: -size * 0.3, left: -size * 0.1, width: size * 0.9, height: size * 0.5, borderRadius: size * 0.25, backgroundColor: 'rgba(255,255,255,0.25)', transform: [{ rotate: '-18deg' }] }} />
                          <Ionicons name={sl.icon} size={size * 0.46} color="#fff" />
                        </>
                      )}
                    </LinearGradient>
                    <View style={{ position: 'absolute', top: 6, right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: showPhoto ? '#22C55E' : '#fff', alignItems: 'center', justifyContent: 'center', ...elevation(2) }}>
                      {showPhoto ? <Ionicons name="checkmark" size={20} color="#fff" /> : <Text style={{ color: t.primary, fontWeight: '900', fontSize: 16 }}>{i + 1}</Text>}
                    </View>
                  </View>
                </Animated.View>
                <Text style={{ color: t.text, ...TYPE.display, textAlign: 'center', letterSpacing: -0.4 }}>{sl.title}</Text>
                <Text style={{ color: t.textMuted, fontSize: 15.5, lineHeight: 22, textAlign: 'center', marginTop: 10, maxWidth: 340 }}>{body}</Text>

                {i === 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                    {sl.chips.map((c) => (
                      <View key={c} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
                        <Text style={{ color: t.text, fontWeight: '700', fontSize: 12 }}>{c}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {i === 0 && photo && (
                  <Pressable onPress={choosePhoto} hitSlop={8} style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="swap-horizontal" size={16} color={t.primary} />
                    <Text style={{ color: t.primary, fontWeight: '800', fontSize: 13 }}>Choose a different photo</Text>
                  </Pressable>
                )}

                {i === 1 && (
                  <View style={{ width: '100%', maxWidth: 380, marginTop: 18 }}>
                    <View style={{ borderRadius: RADIUS.xl, padding: SP.md, backgroundColor: t.surface, borderWidth: 1.5, borderColor: hexToRgba(t.primary, 0.45), ...elevation(1, t.primary) }}>
                      <TextInput
                        value={promptText}
                        onChangeText={setPromptText}
                        multiline
                        maxLength={300}
                        placeholder={TOUR_HINT}
                        placeholderTextColor={t.textMuted}
                        style={{ minHeight: 84, maxHeight: 150, color: t.text, fontSize: 15, lineHeight: 21, textAlignVertical: 'top', paddingVertical: 2 }}
                      />
                    </View>
                    <Text style={{ color: t.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 }}>Leave it empty to use the suggestion above.</Text>
                  </View>
                )}

                {i === 2 && (
                  <View style={{ width: '100%', maxWidth: 380, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, padding: SP.md, borderRadius: RADIUS.xl, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, ...elevation(1, t.primary) }}>
                    <View style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(t.primary, 0.12) }}>
                      {photo ? <Image source={{ uri: photo }} style={{ width: 56, height: 56 }} resizeMode="cover" /> : <Ionicons name="footsteps-outline" size={26} color={t.primary} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>{photo ? 'YOUR PHOTO' : 'DEMO SHOE'}</Text>
                      <Text numberOfLines={3} style={{ color: t.text, fontSize: 13.5, lineHeight: 19, marginTop: 2 }}>
                        {effectivePrompt}
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            );
          })}
        </Animated.ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7, marginVertical: 14 }}>
          {TOUR_SLIDES.map((_, i) => (
            <Animated.View key={i} style={{ height: 7, borderRadius: 4, backgroundColor: t.primary, width: x.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [7, 24, 7], extrapolate: 'clamp' }), opacity: x.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' }) }} />
          ))}
        </View>
        <Pressable onPress={next} disabled={picking} style={{ marginHorizontal: 22 }} accessibilityRole="button">
          <LinearGradient colors={t.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: picking ? 0.7 : 1, ...elevation(3, t.cta[0]) }}>
            {picking ? <ActivityIndicator color="#fff" /> : <Ionicons name={btnIcon} size={20} color="#fff" />}
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{label}</Text>
          </LinearGradient>
        </Pressable>
        {index === 0 && !photo && (
          <Pressable onPress={() => { haptic.tap(); goTo(1); }} hitSlop={8} style={{ alignSelf: 'center', marginTop: 12 }}>
            <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: 13 }}>Use the demo shoe instead</Text>
          </Pressable>
        )}
      </LinearGradient>
    </Modal>
  );
};

/** Shown the first time the credit badge is tapped: what a credit is and how the two numbers work. */
const CreditIntroSheet = ({ visible, credits, onClose, onMore }: { visible: boolean; credits: Credits | null; onClose: () => void; onMore: () => void }) => {
  const t = useTheme();
  let rowIdx = 0;
  const row = (icon: IconName, title: string, body: string) => {
    const rc = t.palette[(rowIdx++ * 2) % 6];
    return (
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(rc, 0.14) }}>
        <Ionicons name={icon} size={20} color={rc} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 14.5 }}>{title}</Text>
        <Text style={{ color: t.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>{body}</Text>
      </View>
    </View>
    );
  };
  return (
    <SheetModal visible={visible} title="How credits work" onClose={onClose}>
      {row('flash-outline', '1 action = 1 credit', 'Generating a Standard 3D scene or running Harmonize uses one credit each. An Advanced scene (richer, two-stage) uses two. Browsing, recording and sharing are free.')}
      {row('sunny-outline', `Today: ${credits?.daily ?? '–'}`, 'Your daily allowance. It refills every day, so unused credits are not carried over.')}
      {row('wallet-outline', `Total: ${credits?.total ?? '–'}`, 'Your overall balance, including credits you buy. An action needs both Today and Total to be above zero.')}
      <Pressable onPress={onClose} style={{ marginTop: 4 }}>
        <LinearGradient colors={t.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Got it</Text>
        </LinearGradient>
      </Pressable>
      <Pressable onPress={onMore} style={{ alignItems: 'center', paddingVertical: 14 }}>
        <Text style={{ color: t.primary, fontWeight: '800' }}>Get more credits</Text>
      </Pressable>
    </SheetModal>
  );
};

/* ============================================================================
 * 14. MAIN SCREEN
 * ========================================================================== */

type BusyState = { step: number; label?: string; prep?: boolean } | null;
type FlowStep = 'photo' | 'scene' | 'result';
type ErrorState = { message: string; retry: () => void; altLabel?: string; alt?: () => void } | null;

const SCENE_SUGGESTIONS: { label: string; icon: IconName; text: string }[] = [
  { label: 'Studio', icon: 'aperture-outline', text: 'Clean white studio with soft shadows, high quality e-commerce video ad' },
  { label: 'Luxury', icon: 'diamond-outline', text: 'On a marble pedestal with warm gold lighting, premium advertisement' },
  { label: 'Living room', icon: 'home-outline', text: 'Floating above a table in a modern living room, soft daylight' },
  { label: 'Outdoors', icon: 'sunny-outline', text: 'On a sunlit rock by the sea at golden hour, cinematic' },
  { label: 'Neon', icon: 'flash-outline', text: 'In a neon-lit cyberpunk street at night with wet reflections' },
  { label: 'Minimal', icon: 'ellipse-outline', text: 'Minimal pastel backdrop with gentle floating motion' },
];

const FLOW_STEPS: { id: FlowStep; label: string; icon: IconName }[] = [
  { id: 'photo', label: 'Photo', icon: 'camera-outline' },
  { id: 'scene', label: 'Scene', icon: 'create-outline' },
  { id: 'result', label: 'Result', icon: 'cube-outline' },
];

/** Three-stage progress rail: Photo, Scene, Result. Finished stages show a check and can be revisited. */
const FlowRail = memo(function FlowRail({ step, canResult, onStep }: { step: FlowStep; canResult: boolean; onStep: (s: FlowStep) => void }) {
  const t = useTheme();
  const idx = FLOW_STEPS.findIndex((x) => x.id === step);
  const fill = useRef(new Animated.Value(idx)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: idx, duration: MOTION.slow, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [idx, fill]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SP.lg, paddingHorizontal: SP.xs }} accessibilityRole="tablist">
      {FLOW_STEPS.map((st, i) => {
        const done = i < idx;
        const active = i === idx;
        const enabled = st.id !== 'result' || canResult || active;
        const sc = t.steps[i];
        return (
          <React.Fragment key={st.id}>
            {i > 0 && (
              <View style={{ flex: 1, height: 3, borderRadius: 2, marginTop: 17, backgroundColor: hexToRgba(t.textMuted, 0.25), overflow: 'hidden' }}>
                <Animated.View style={{ height: 3, width: fill.interpolate({ inputRange: [i - 1, i], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) }}>
                  <LinearGradient colors={[t.steps[i - 1], t.steps[i]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
                </Animated.View>
              </View>
            )}
            <Pressable
              onPress={() => {
                if (!enabled || active) return;
                haptic.select();
                onStep(st.id);
              }}
              disabled={!enabled}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled: !enabled }}
              accessibilityLabel={`Step ${i + 1}: ${st.label}${done ? ', done' : ''}`}
              hitSlop={hitFor(36)}
              style={{ width: 64, alignItems: 'center', opacity: enabled ? 1 : 0.45 }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: done || active ? sc : hexToRgba(sc, 0.12), borderWidth: done || active ? 0 : 1.5, borderColor: done || active ? 'transparent' : hexToRgba(sc, 0.45), ...(active ? elevation(2, sc) : null) }}>
                <Ionicons name={done ? 'checkmark' : st.icon} size={active || done ? 19 : 17} color={done || active ? '#fff' : sc} />
              </View>
              <Text style={{ marginTop: 5, fontSize: 11.5, fontWeight: active ? '800' : '600', color: active ? sc : t.textMuted }}>{st.label}</Text>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
});

function StudioScreen({ themeId, setThemeId }: { themeId: string; setThemeId: (id: string) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height: winH } = useWindowDimensions();

  const [mode, setMode] = useState<'film' | 'camera'>('film');
  const [asset, setAsset] = useState<ProductAsset | null>(null);
  const [scene, setScene] = useState<SceneSpec>(DEFAULT_SCENE_SPEC);
  const [prompt, setPrompt] = useState(DEMO_PROMPT);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<ErrorState>(null);
  const [playing, setPlaying] = useState(true);
  // Render quality is fixed (the SD/HD toggle was removed): sharp on every device.
  const hd = true;
  const [fullscreen, setFullscreen] = useState(false);
  const [presetIdx, setPresetIdx] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryW, setGalleryW] = useState(0); // measured width of the modal content, for the two-column grid
  const [themeOpen, setThemeOpen] = useState(false);
  const [platformText, setPlatformText] = useState(DEFAULT_PLATFORM_SPEC);
  // Settings: platforms switched OFF (empty = every platform is generated, the default).
  const [disabledPlatforms, setDisabledPlatformsState] = useState<string[]>([]);
  // Saved on the phone (expo-sqlite) so the platform switches survive closing the app.
  const setDisabledPlatforms = useCallback((v: string[]) => {
    setDisabledPlatformsState(v);
    kvSet('disabled_platforms_v1', JSON.stringify(v)).catch(() => undefined);
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const raw = await kvGet('disabled_platforms_v1');
        const arr = raw ? JSON.parse(raw) : null;
        if (Array.isArray(arr)) setDisabledPlatformsState(arr.filter((x): x is string => typeof x === 'string'));
      } catch {}
    })();
  }, []);
  // Settings: extra product angles requested from the cloud (default: 'scene' only, which is always on) + the images that have arrived so far.
  const [angles, setAnglesState] = useState<CloudAngle[]>(() => withAlwaysOnAngles([]));
  const anglesRef = useRef<CloudAngle[]>(withAlwaysOnAngles([]));
  anglesRef.current = angles;
  const setAngles = useCallback((v: CloudAngle[]) => {
    const next = withAlwaysOnAngles(v); // 'scene' can never be switched off
    setAnglesState(next);
    kvSet('angles_v1', JSON.stringify(next));
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const raw = await kvGet('angles_v1');
        const arr = raw ? (JSON.parse(raw) as string[]) : [];
        setAnglesState(withAlwaysOnAngles(arr));
      } catch {}
    })();
  }, []);
  // Settings: scene quality. Standard = 1 credit (one agent pass), Advanced = 2 credits (two-stage agent). Saved on the phone.
  const [quality, setQualityState] = useState<SceneQuality>(DEFAULT_SCENE_QUALITY);
  const qualityRef = useRef<SceneQuality>(DEFAULT_SCENE_QUALITY);
  qualityRef.current = quality;
  /** The quality that was charged for the generation in progress (what buildSceneNames writes into the upload name). */
  const jobQualityRef = useRef<SceneQuality>(DEFAULT_SCENE_QUALITY);
  const setQuality = useCallback((v: SceneQuality) => {
    const next = asSceneQuality(v);
    setQualityState(next);
    kvSet('scene_quality_v1', next);
  }, []);
  useEffect(() => {
    (async () => {
      try {
        setQualityState(asSceneQuality(await kvGet('scene_quality_v1')));
      } catch {}
    })();
    void loadPostFxSettings();
  }, []);
  const [cloudImages, setCloudImages] = useState<Partial<Record<CloudAngle, string>>>({});
  const angleRun = useRef({ aborted: false });
  const [scenePending, setScenePending] = useState(false);
  const [pendingAngles, setPendingAngles] = useState<CloudAngle[]>([]);
  const [failedAngles, setFailedAngles] = useState<CloudAngle[]>([]);
  const [sceneUnavailable, setSceneUnavailable] = useState(false);
  /** Retouch: icon visibility comes from the backend ('showretouch', default hidden). */
  const [showRetouch, setShowRetouch] = useState(false);
  /** A Retouch result of an item without product views / scene images only shows the 3D live preview. */
  const [productViewsHidden, setProductViewsHidden] = useState(false);
  /** While a Retouch runs (non-blocking): the preview canvas shows its animation, the rest of the screen stays usable. */
  const [retouchStage, setRetouchStage] = useState<RetouchStage | null>(null);
  /** The page as it was before the last Retouch (kept with the Library item), for the before / after compare. */
  const [beforeHtml, setBeforeHtml] = useState<string | null>(null);
  const [compareOn, setCompareOn] = useState(false);
  /** the share popover on the 3D preview (After / Before page of a Retouch) */
  const [shareMenu, setShareMenu] = useState(false);
  const [retouchReveal, setRetouchReveal] = useState(false);
  const toggleCompare = useCallback(() => {
    setRetouchReveal(false); // the curtain plays once, right after a Retouch
    setCompareOn((v) => !v);
  }, []);
  /** "Exit compare": always lands on the new (retouched) scene alone, never toggles back into the compare view */
  const exitCompare = useCallback(() => {
    setRetouchReveal(false);
    setCompareOn(false);
  }, []);
  /** Retouch history of the scene on screen (oldest first) and which one is shown. */
  const [versions, setVersions] = useState<SceneVersion[]>([]);
  const [versionIdx, setVersionIdx] = useState(0);
  const parentVersionsRef = useRef<SceneVersion[] | null>(null);
  const beforeHtmlRef = useRef<string | null>(null);
  beforeHtmlRef.current = beforeHtml;
  const sceneJobRef = useRef<SceneJob | null>(null);
  const specUriRef = useRef<string | null>(null);
  const savedItemRef = useRef<{ id: string; jobId: string } | null>(null);
  /** The Library item whose scene is on the 3D canvas (saved after a generation / Retouch, or opened from the Library): the canvas Retouch button works on it. */
  const [canvasItem, setCanvasItem] = useState<LibraryItem | null>(null);
  const retouchedRef = useRef(false);
  const retouchCtxRef = useRef<(() => void) | null>(null);
  /** The scene spec arrived: keep it for the save, or (when the item is already saved) add it to the item. */
  const attachSpecRef = useRef<((jobId: string, uri: string) => void) | null>(null);
  attachSpecRef.current = (jobId: string, uri: string) => {
    specUriRef.current = uri;
    const si = savedItemRef.current;
    const name = sceneJobRef.current?.names?.specFile;
    if (!si || si.jobId !== jobId || !name) return;
    const specPath = persistItemFile(si.id, name, { uri });
    if (!specPath) return;
    void (async () => {
      const cur = await libraryPayload<ScenePayload>(si.id);
      const vs = cur?.versions?.length ? cur.versions.map((v, i, arr) => (i === arr.length - 1 ? { ...v, specPath } : v)) : undefined;
      await libraryPatchPayload(si.id, vs ? { specPath, versions: vs } : { specPath });
    })();
  };
  const platformOptions = useMemo(() => parsePlatformSpec(platformText), [platformText]);
  const [bg, setBg] = useState<PlatformBackground>({ kind: 'color', color: '#FFFFFF' });
  // The platform-image background COLOUR is saved on the phone (expo-sqlite). A picked photo is a temporary file, so it is not kept.
  const bgLoadedRef = useRef(false);
  useEffect(() => {
    (async () => {
      try {
        const saved = await kvGet('platform_bg_color_v1');
        if (saved && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(saved)) setBg((cur) => (cur.kind === 'color' ? { kind: 'color', color: saved } : cur));
      } catch {}
      bgLoadedRef.current = true;
    })();
  }, []);
  useEffect(() => {
    if (bgLoadedRef.current && bg.kind === 'color') kvSet('platform_bg_color_v1', bg.color).catch(() => undefined);
  }, [bg]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removedKeys, setRemovedKeys] = useState<string[]>([]);
  // Guided create flow: Photo -> Scene -> Result
  const [flowStep, setFlowStep] = useState<FlowStep>('photo');
  const goStep = useCallback((st: FlowStep) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFlowStep(st);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 60);
  }, []);
  const [menuItem, setMenuItem] = useState<GalleryItem | null>(null);
  /** After a scene is generated: forget the result and begin the 3-step flow again (photo -> describe -> generate). */
  const startOver = useCallback(() => {
    angleRun.current.aborted = true; // stop watching the images of the finished job
    setSceneHtml(null);
    setScenePending(false);
    setSceneUnavailable(false);
    setFailedAngles([]);
    setCloudImages({});
    setPendingAngles([]);
    setResultReveal(null);
    setRemovedKeys([]);
    setCompareA(null);
    setProductViewsHidden(false);
    retouchCtxRef.current = null;
    setRetouchStage(null);
    setBeforeHtml(null);
    setCompareOn(false);
    setRetouchReveal(false);
    setVersions([]);
    setCanvasItem(null);
    parentVersionsRef.current = null;
    retouchedRef.current = false;
    goStep('photo');
  }, [goStep]);
  const [compareA, setCompareA] = useState<GalleryItem | null>(null);
  const [comparePair, setComparePair] = useState<[GalleryItem, GalleryItem] | null>(null);
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'views' | 'platforms'>('all');
  // Generation experience: photo shown in the loader + celebration when a scene arrives.
  const [genPhoto, setGenPhoto] = useState<string | undefined>(undefined);
  const [revealKey, setRevealKey] = useState(0);
  const [resultReveal, setResultReveal] = useState<RevealData | null>(null);
  const closeResultReveal = useCallback(() => setResultReveal(null), []);
  const prevBusyRef = useRef(false);
  // Library
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  // backend 'canvassnapshotlib': which library wraps the 3D preview for the Retouch snapshot (default react-native-view-recorder)
  const [snapshotLib, setSnapshotLib] = useState<SnapshotLib>(DEFAULT_3D_CANVAS_SNAPSHOT_LIB);
  useEffect(() => {
    let live = true;
    read3dCanvasSnapshotLib().then((v) => live && setSnapshotLib(v)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const [libraryLoading, setLibraryLoading] = useState(false);
  useEffect(() => {
    if (!libraryOpen) return;
    let live = true;
    readShowRetouch().then((v) => live && setShowRetouch(v));
    return () => {
      live = false;
    };
  }, [libraryOpen]);
  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryItems(await libraryList());
    setLibraryLoading(false);
  }, []);
  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);
  // First run: welcome tour + credit explainer (each shown once; flags live in expo-sqlite).
  const [tourOpen, setTourOpen] = useState(false);
  const [tourSession, setTourSession] = useState(0);
  const openTour = useCallback(() => {
    setTourSession((k) => k + 1);
    setTourOpen(true);
  }, []);
  const [creditIntroOpen, setCreditIntroOpen] = useState(false);
  const creditIntroSeen = useRef(true);
  const [ctaDone, setCtaDone] = useState(false);
  const ctaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    (async () => {
      if (!(await kvGet('onboarded_v1'))) openTour();
      creditIntroSeen.current = !!(await kvGet('credit_intro_seen_v1'));
    })();
    return () => {
      if (ctaTimer.current) clearTimeout(ctaTimer.current);
    };
  }, []);
  const closeTour = useCallback(() => {
    setTourOpen(false);
    kvSet('onboarded_v1', '1');
  }, []);
  const closeCreditIntro = useCallback(() => {
    setCreditIntroOpen(false);
    creditIntroSeen.current = true;
    kvSet('credit_intro_seen_v1', '1');
  }, []);
  const [platformImages, setPlatformImages] = useState<PlatformImage[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [recState, setRecState] = useState<RecState>('idle');
  const [recStartedAt, setRecStartedAt] = useState<number | null>(null);
  const recStateRef = useRef<RecState>('idle');
  const harmonizeJobRef = useRef<unknown>(null);
  /** which recorder is running: the screen recorder (stoppable) or the 3D-canvas view recorder (fixed duration, no stop) */
  const recorderKindRef = useRef<'turbo' | 'canvas' | null>(null);
  /** true while react-native-view-recorder films the 3D canvas: it stops by itself after the set duration, so no badge and no Stop button */
  const [canvasRecording, setCanvasRecording] = useState(false);
  recStateRef.current = recState;
  useEffect(() => {
    setSceneRecording(recState !== 'idle');
  }, [recState]);
  // Harmonize: refs filled by the camera background (photo) and the 3D canvas (foreground snapshot).
  const captureRef = useRef<CaptureHandle>({});
  const [harmonizeJob, setHarmonizeJob] = useState<{ stage: HarmonizeStage; blendedUri?: string } | null>(null);
  harmonizeJobRef.current = harmonizeJob;
  const [harmonized, setHarmonized] = useState<{ blendedUri: string; harmonizedUri: string } | null>(null);
  const [showAfter, setShowAfter] = useState(true);
  const harmonizeBusyRef = useRef(false);
  // Finger placement of the 3D product (Camera Studio). A ref: gestures must not re-render the screen.
  // Keep the "Describe your scene" input visible above the keyboard.
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const describeRef = useRef<View>(null);
  const describeFocused = useRef(false);
  const kbTopRef = useRef<number | null>(null);
  const [kbH, setKbH] = useState(0);
  const describeY = useRef(0);
  // Deterministic: bring the card's TOP to the top of the screen. The area above the keyboard is always taller than the
  // card, so it can never end up underneath it (no window / keyboard coordinate maths, which differ per Android build).
  const revealDescribe = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, describeY.current - (insets.top + 12)), animated: true }), 120);
  }, [insets.top]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      kbTopRef.current = e.endCoordinates.screenY;
      setKbH(e.endCoordinates.height);
      if (describeFocused.current) revealDescribe();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      kbTopRef.current = null;
      setKbH(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [revealDescribe]);

  const [camView, setCamView] = useState<ViewLabel>('front'); // Camera Studio shows this ONE image
  const userXformRef = useRef<UserXform>(newUserXform());
  const [xformDirty, setXformDirty] = useState(false);
  const resetXform = useCallback(() => {
    Object.assign(userXformRef.current, newUserXform());
    setXformDirty(false);
  }, []);
  const markXformDirty = useCallback(() => setXformDirty(true), []);
  useEffect(() => {
    resetXform(); // a new product starts centred
  }, [asset?.id, resetXform]);
  // Where the product centre sits (as a fraction of the preview height, below the middle) before any gesture.
  const camPivotY = useMemo(() => {
    const visH = 2 * scene.camera.distance * Math.tan(THREE.MathUtils.degToRad(scene.camera.fov) / 2);
    return -CAMERA_MODE_BASE[1] / visH;
  }, [scene.camera.distance, scene.camera.fov]);
  const playingStateRef = useRef(playing);
  playingStateRef.current = playing;
  // Credits: the credit API is the source of truth, expo-sqlite mirrors it, 1 action = 1 credit.
  const [credits, setCredits] = useState<Credits | null>(null);
  const [creditSource, setCreditSource] = useState<CreditSource>('default');
  const [creditsSyncing, setCreditsSyncing] = useState(true);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  /** Backend flag 'showrevenuecat' (default false): store modal vs the "credits reset tomorrow" sheet. */
  const [showRevenueCat, setShowRevenueCat] = useState(false);
  const [packsLoading, setPacksLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const creditsRef = useRef<Credits | null>(null);
  creditsRef.current = credits;
  const creditBusyRef = useRef(false);
  // Film Studio main flow: HTML page returned by the cloud API, shown in the sandboxed WebView.
  const [sceneHtml, setSceneHtml] = useState<string | null>(null);
  const [filmRenderer, setFilmRenderer] = useState<'cloud' | 'local'>('cloud');
  const [reloadKey, setReloadKey] = useState(0);
  const [previewStatus, setPreviewStatus] = useState<ScenePreviewStatus>('loading');
  const previewStatusRef = useRef<ScenePreviewStatus>('loading');
  const snapshotApiRef = useRef<SnapshotApi>({});
  const filmRendererRef = useRef(filmRenderer);
  filmRendererRef.current = filmRenderer;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  /* ---- pipeline: photo -> ProductAsset ---- */
  const planScene = useCallback(
    async (text: string, a: ProductAsset, stepIdx = PIPELINE_STEPS.length - 1) => {
      setBusy({ step: stepIdx });
      if (modeRef.current === 'film' && filmRendererRef.current === 'cloud') {
        // Main flow: product image + scene description -> cloud API -> full Three.js HTML.
        angleRun.current.aborted = true; // stop watching a previous run
        const signal = { aborted: false };
        angleRun.current = signal;
        setCloudImages({});
        setProductViewsHidden(false);
        retouchCtxRef.current = null;
    setRetouchStage(null);
    setBeforeHtml(null);
    setCompareOn(false);
    setRetouchReveal(false);
    setVersions([]);
    setCanvasItem(null);
    parentVersionsRef.current = null;
        retouchedRef.current = false;
        sceneJobRef.current = null;
        specUriRef.current = null;
        savedItemRef.current = null;
        setCanvasItem(null);
        const names = buildSceneNames(anglesRef.current, await getDeviceUUID(), jobQualityRef.current);
        setSceneHtml(null);
        setScenePending(true);
        setSceneUnavailable(false);
        setFailedAngles([]);
        setPendingAngles(names.angles);
        const arrived = new Set<CloudAngle>();
        let loggedJob: SceneJob | undefined;
        const logImage = () => loggedJob?.imagePath ?? (loggedJob ? `public/scenes/${loggedJob.jobId}/${names.imageFile}` : undefined);
        // Not blocking: the loader only covers the upload. Once the job is on its way (onJob) the screen is free again,
        // the preview shows the "building" animation, and the page + each angle image land whenever they are ready.
        let uploaded!: () => void;
        const uploadedP = new Promise<void>((res) => (uploaded = res));
        const htmlP = Services.sceneHtml(
          a,
          text,
          names,
          (label) => setBusy({ step: stepIdx, label }),
          async (job) => {
            uploaded();
            loggedJob = job;
            sceneJobRef.current = job;
            void watchSceneSpec(job, { signal }, (uri) => attachSpecRef.current?.(job.jobId, uri));
            // MOCK simulation only: PRODUCTION never builds (or shows) demo/simulated images.
            const sim: Partial<Record<CloudAngle, string>> = {};
            if (shouldSimulateCloud()) {
              Object.assign(sim, { front: a.views.front.imageUri, left: a.views.left.imageUri, right: a.views.right.imageUri, back: a.views.back.imageUri, scene: a.cleanImageUri });
              if (USE_BUNDLED_MOCK_IMAGES) {
                try {
                  sim.scene = await bundledMockUri('scene');
                } catch (e) {
                  console.warn('[Magic3DStudio] bundled scene image failed', e);
                }
              }
            }
            watchAngleImages(
              job,
              (angle, uri) => {
                if (signal.aborted) return;
                arrived.add(angle);
                setCloudImages((m) => ({ ...m, [angle]: uri }));
                setPendingAngles((l) => l.filter((x) => x !== angle));
                haptic.success();
                showToastRef.current?.(`${CLOUD_ANGLES.find((x) => x.id === angle)?.label ?? angle} image ready`);
              },
              { signal, sim, timeoutMs: CLOUD_FILE_TIMEOUT_MS },
            )
              .catch((e) => console.warn('[Magic3DStudio] angle watch failed', e))
              .finally(() => {
                if (signal.aborted) return;
                // whatever has not arrived by the timeout is shown as "not available"
                const missing = names.angles.filter((x) => !arrived.has(x));
                setPendingAngles([]);
                if (missing.length) {
                  setFailedAngles(missing);
                  haptic.warning();
                  showToastRef.current?.(`${missing.length === 1 ? 'An image is' : 'Some images are'} not available`);
                }
              });
          },
        );
        // An upload failure rejects here (before onJob) and takes the normal error path.
        await Promise.race([uploadedP, htmlP]).catch((e) => {
          void logActionDetail({ action: 'generate_3d_scene', prompt: text }); // the upload itself failed
          setScenePending(false);
          setPendingAngles([]);
          throw e;
        });
        htmlP.then(
          (html) => {
            if (signal.aborted) return;
            void logActionDetail({ action: 'generate_3d_scene', prompt: text, imagePath: logImage() });
            setSceneHtml(html);
            setReloadKey((k) => k + 1);
            setScenePending(false);
            haptic.success();
            showToastRef.current?.('3D scene ready');
          },
          (e) => {
            if (signal.aborted) return;
            void logActionDetail({ action: 'generate_3d_scene', prompt: text, imagePath: logImage() }); // timeout or failure
            console.warn('[Magic3DStudio] cloud scene failed', e);
            setScenePending(false);
            setSceneUnavailable(true); // the preview shows the "3D scene not available" card; the images keep arriving on their own
            haptic.warning();
            showToastRef.current?.('The 3D scene is not available');
          },
        );
        return;
      }
      // Camera Studio (and the local Film renderer) use the fixed R3F renderer with the default SceneSpec; the scene itself is generated by the backend.
      setScene(applyMode(validateSceneSpec(DEFAULT_SCENE_SPEC), modeRef.current));
    },
    [],
  );

  const planSceneRef = useRef<typeof planScene>();
  planSceneRef.current = planScene;

  const runPipeline = useCallback(
    async (uri: string, thenPrompt?: string) => {
      setError(null);
      setRemovedKeys([]);
      setCompareA(null);
      setGenPhoto(uri);
      setBusy({ step: 0 });
      try {
        const a = await runProductPipeline(uri, (i) => setBusy({ step: i }));
        setAsset(a);
        await planScene(thenPrompt ?? prompt, a);
        setResultReveal({ original: a.originalImageUri, clean: a.cleanImageUri, views: VIEW_ORDER.map((l) => ({ label: l, uri: a.views[l].imageUri })) });
        goStep('result');
      } catch (e) {
        console.error('[Magic3DStudio] pipeline failed', e);
        setError({ message: 'Something went wrong while processing your photo.', retry: () => runPipeline(uri, thenPrompt) });
      } finally {
        setGenPhoto(undefined);
        setBusy(null);
      }
    },
    [planScene, prompt, goStep],
  );

  /**
   * Guided flow, step 1: only prepares the photo (cut-out, four views, depth, analysis) and moves on to the Scene step.
   * No scene is generated and no credit is spent until the user taps Generate. `silent` = no loader (app start).
   */
  const prepPhoto = useCallback(
    async (uri: string, opts: { silent?: boolean } = {}) => {
      setError(null);
      setRemovedKeys([]);
      setCompareA(null);
      if (!opts.silent) {
        setGenPhoto(uri);
        setBusy({ step: 0, prep: true });
      }
      try {
        const a = await runProductPipeline(uri, (i) => !opts.silent && setBusy({ step: i, prep: true }));
        angleRun.current.aborted = true; // stop watching images of the previous photo
        setAsset(a);
        setSceneHtml(null);
        setScenePending(false);
        setSceneUnavailable(false);
        setFailedAngles([]);
        setCloudImages({});
        setPendingAngles([]);
        setProductViewsHidden(false);
        retouchCtxRef.current = null;
    setRetouchStage(null);
    setBeforeHtml(null);
    setCompareOn(false);
    setRetouchReveal(false);
    setVersions([]);
    setCanvasItem(null);
    parentVersionsRef.current = null;
        retouchedRef.current = false;
        if (!opts.silent) {
          haptic.success();
          goStep(modeRef.current === 'camera' ? 'result' : 'scene'); // Camera Studio needs no scene: the cut-out is enough
        }
      } catch (e) {
        console.error('[Magic3DStudio] photo prep failed', e);
        if (!opts.silent) setError({ message: 'Something went wrong while processing your photo.', retry: () => prepPhoto(uri) });
      } finally {
        if (!opts.silent) {
          setGenPhoto(undefined);
          setBusy(null);
        }
      }
    },
    [goStep],
  );

  // Latest values for the (async) auto-save below.
  const latest = useRef({ asset, sceneHtml, prompt, cloudImages });
  latest.current = { asset, sceneHtml, prompt, cloudImages };
  /** The html that is already in the Library (or was opened from it), so it is never saved twice. */
  const savedHtmlRef = useRef<string | null>(null);

  const saveSceneToLibrary = useCallback(async () => {
    const { asset: a, sceneHtml: html, prompt: pr, cloudImages: cloud } = latest.current;
    if (!a || !html) return;
    try {
      // One bad image must never abort the whole save (it also carries the Retouch version timeline): fall back to the original uri.
      const safeStore = async (u: string, side: number, fmt: 'png' | 'jpeg' = 'png'): Promise<string> => {
        try {
          return await toStorableUri(u, side, fmt);
        } catch (e) {
          console.warn('[Magic3DStudio] could not down-scale an image for the Library, keeping the original', e);
          return u;
        }
      };
      const id = uid() + Date.now().toString(36);
      const job = sceneJobRef.current;
      const nm = job?.names;
      // keep the page (and the scene spec, when it has arrived) as files next to the item, and remember where they are
      const htmlPath = persistItemFile(id, nm?.htmlFile ?? `${id}.html`, { text: html });
      const specPath = specUriRef.current && nm?.specFile ? persistItemFile(id, nm.specFile, { uri: specUriRef.current }) : undefined;
      savedItemRef.current = job ? { id, jobId: job.jobId } : null;
      // Retouch history: copy the earlier versions' files into this item's folder (so deleting the parent item never breaks them)
      let versions: SceneVersion[] | undefined;
      const pv = parentVersionsRef.current;
      if (pv?.length) {
        versions = [];
        for (let i = 0; i < pv.length; i++) {
          const v = pv[i];
          const hp = v.htmlPath ? persistItemFile(id, `v${i}.html`, { uri: v.htmlPath }) : undefined;
          const sp = v.specPath ? persistItemFile(id, `v${i}.json`, { uri: v.specPath }) : undefined;
          versions.push({ label: v.label, created: v.created, thumb: v.thumb, htmlPath: hp, specPath: sp });
        }
        const rawThumb = cloud.front ?? a.views.front.imageUri;
        const last: SceneVersion = { label: `Retouch ${pv.length}`, created: Date.now(), thumb: rawThumb, htmlPath, specPath };
        versions.push(last);
        // Show the "Versions" timeline right away: the slow image encoding below (and the Library write) must not delay it, or lose it if they fail.
        setVersions([...versions]);
        setVersionIdx(versions.length - 1);
        last.thumb = await safeStore(rawThumb, 140, 'jpeg'); // the stored (small) thumbnail is what the Library keeps
      }
      // the generated (cloud) angle images win over the local ones
      const views = {} as Record<ViewLabel, string>;
      for (const l of VIEW_ORDER) views[l] = await safeStore(cloud[l] ?? a.views[l].imageUri, 768, 'png');
      const storedCloud: Partial<Record<CloudAngle, string>> = {};
      for (const k of Object.keys(cloud) as CloudAngle[]) if (cloud[k]) storedCloud[k] = await safeStore(cloud[k] as string, 768, 'png');
      const thumb = await safeStore(cloud.front ?? a.views.front.imageUri, 360, 'png');
      const clean = await safeStore(a.cleanImageUri, 1024, 'png'); // the cut-out: the platform images are re-made from it when the item is opened
      const before = beforeHtmlRef.current;
      const beforeHtmlPath = before ? persistItemFile(id, `before-${nm?.htmlFile ?? `${id}.html`}`, { text: before }) : undefined;
      const title = `${sceneTitle(a.metadata)}${retouchedRef.current ? ' (Retouched)' : ''}`;
      const item: LibraryItem = { id, kind: 'scene', title, prompt: pr, created: Date.now(), favorite: false, thumb };
      await librarySave(item, {
        html,
        asset: { id: a.id, views, metadata: a.metadata, clean },
        cloud: storedCloud,
        htmlPath,
        specPath,
        beforeHtmlPath,
        versions,
        names: nm ? { base: nm.base, key: nm.key, angles: nm.angles, htmlFile: nm.htmlFile, specFile: nm.specFile } : undefined,
      });
      if (versions) {
        setVersions(versions);
        setVersionIdx(versions.length - 1);
      }
      setCanvasItem(item);
      refreshLibrary();
      showToast('Saved to Library');
    } catch (e) {
      console.warn('[Magic3DStudio] could not save the scene to the Library', e);
    }
  }, [refreshLibrary, showToast]);

  const saveHarmonizedToLibrary = useCallback(
    async (beforeUri: string, afterUri: string) => {
      try {
        const [b, a2, thumb] = await Promise.all([toStorableUri(beforeUri, 1280, 'jpeg'), toStorableUri(afterUri, 1280, 'jpeg'), toStorableUri(afterUri, 360, 'jpeg')]);
        const item: LibraryItem = { id: uid() + Date.now().toString(36), kind: 'harmonized', title: 'Harmonized photo', prompt: '', created: Date.now(), favorite: false, thumb };
        await librarySave(item, { beforeUri: b, afterUri: a2 });
        refreshLibrary();
      } catch (e) {
        console.warn('[Magic3DStudio] could not save the photo to the Library', e);
      }
    },
    [refreshLibrary],
  );

  /** Puts a saved scene's product + images back on screen. `pending` = a Retouch is about to fill in the 3D page. */
  const restoreSceneItem = useCallback(
    (item: LibraryItem, p: ScenePayload, opts: { pending?: boolean } = {}) => {
      const saved = p.asset?.views as Partial<Record<ViewLabel, string>> | undefined;
      const hasViews = !!saved && VIEW_ORDER.every((l) => !!saved[l]);
      const hasCloud = !!p.cloud && Object.values(p.cloud).some(Boolean);
      const fallback = p.cloud?.front ?? p.cloud?.scene ?? item.thumb;
      const views = {} as ProductViews;
      // a view that was never generated by the cloud was only a local placeholder drawing: it is not restored (the cut-out stands in)
      const cutout = p.asset?.clean || saved?.front || fallback;
      VIEW_ORDER.forEach((l) => (views[l] = { imageUri: p.cloud?.[l] || (p.asset?.clean ? cutout : saved?.[l] || fallback), label: l }));
      // the saved cut-out feeds the platform images; older items (saved before the cut-out was kept) fall back to the front view until openLibraryItem re-cuts it
      const a: ProductAsset = { id: p.asset?.id ?? item.id, originalImageUri: cutout, cleanImageUri: cutout, views, metadata: p.asset.metadata };
      setPlatformImages([]); // never leave the previous product's (or the demo shoe's) platform images showing: they are re-made from this cut-out
      angleRun.current.aborted = true;
      retouchCtxRef.current = null;
    setRetouchStage(null);
    setBeforeHtml(null);
    setCompareOn(false);
    setRetouchReveal(false);
    setVersions([]);
    setCanvasItem(null);
    parentVersionsRef.current = null;
      retouchedRef.current = false;
      sceneJobRef.current = null;
      specUriRef.current = null;
      savedItemRef.current = null;
      // the product views can only be rebuilt from saved views / scene images; without them only the 3D live preview is shown
      setProductViewsHidden(!hasViews && !hasCloud);
      setMode('film');
      setScene((sc) => applyMode(sc, 'film'));
      filmRendererRef.current = 'cloud';
      setFilmRenderer('cloud');
      setAsset(a);
      setPrompt(item.prompt || prompt);
      savedHtmlRef.current = p.html; // already in the Library
      setCloudImages(p.cloud ?? {});
      setPendingAngles([]);
      setFailedAngles([]);
      setSceneUnavailable(false);
      setScenePending(!!opts.pending);
      if (opts.pending) setSceneHtml(null);
    },
    [prompt],
  );

  const openLibraryItem = useCallback(
    async (item: LibraryItem) => {
      if (item.kind === 'harmonized') {
        const p = await libraryPayload<HarmonizedPayload>(item.id);
        if (!p) return showToast('This item is no longer available');
        setLibraryOpen(false);
        setShowAfter(true);
        setHarmonized({ blendedUri: p.beforeUri, harmonizedUri: p.afterUri });
        return;
      }
      const p = await libraryPayload<ScenePayload>(item.id);
      if (!p) return showToast('This item is no longer available');
      setLibraryOpen(false);
      restoreSceneItem(item, p);
      // the 3D preview loads the page from the saved file; the copy kept in the payload is only the fallback
      const html = await readSavedHtml(p);
      savedHtmlRef.current = html; // already in the Library
      setSceneHtml(html);
      setReloadKey((k) => k + 1);
      setCanvasItem(item);
      goStep('result');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      // an item saved before the cut-out was kept: cut the product out of its saved front image once, and keep the result for next time
      if (!p.asset?.clean) {
        const src = p.asset?.views?.front || p.cloud?.front;
        if (src) {
          void (async () => {
            try {
              const [, cutUri] = await Services.removeBackground(src);
              const stored = await toStorableUri(cutUri, 1024, 'png');
              setAsset((cur) => (cur && cur.id === (p.asset?.id ?? item.id) ? { ...cur, cleanImageUri: stored, originalImageUri: stored } : cur));
              void libraryPatchPayload(item.id, { asset: { ...p.asset, clean: stored } });
            } catch (e) {
              console.warn('[Magic3DStudio] could not cut the product out of the saved image', e);
            }
          })();
        }
      }
      if (p.versions && p.versions.length > 1) {
        setVersions(p.versions);
        setVersionIdx(p.versions.length - 1);
      }
      // a Retouched item can be compared with the page it was made from
      try {
        if (p.beforeHtmlPath) {
          const f = new File(p.beforeHtmlPath);
          if (f.exists) setBeforeHtml(await f.text());
        }
      } catch (e) {
        console.warn('[Magic3DStudio] could not read the before page', e);
      }
    },
    [prompt, showToast, restoreSceneItem, goStep],
  );


  // When a generation finishes without an error, celebrate (not on the silent first boot with the demo shoe).
  const errorSeen = useRef<ErrorState>(null);
  const firstBootRef = useRef(true);
  errorSeen.current = error;
  useEffect(() => {
    const was = prevBusyRef.current;
    prevBusyRef.current = !!busy;
    if (was && !busy && !errorSeen.current) {
      if (firstBootRef.current) firstBootRef.current = false; // the automatic demo-shoe boot stays quiet
      else {
        setRevealKey((k) => k + 1);
        haptic.success();
        setCtaDone(true);
        if (ctaTimer.current) clearTimeout(ctaTimer.current);
        ctaTimer.current = setTimeout(() => setCtaDone(false), 3000);
      }
    }
  }, [busy]);

  // The 3D page arrives after the loader is gone (non-blocking flow), so save once the html AND the angle images are in.
  useEffect(() => {
    if (!sceneHtml) {
      savedHtmlRef.current = null; // a new generation may return the same page (mock), so forget the last one
      return;
    }
    if (scenePending || pendingAngles.length > 0) return;
    if (savedHtmlRef.current === sceneHtml) return;
    savedHtmlRef.current = sceneHtml;
    saveSceneToLibrary();
  }, [sceneHtml, scenePending, pendingAngles, saveSceneToLibrary]);

  const generateScene = useCallback(
    async (text: string) => {
      if (!asset) {
        showToast('Add a product photo first');
        return;
      }
      setError(null);
      try {
        // A user-initiated generate always goes back to the cloud renderer in Film Studio.
        filmRendererRef.current = 'cloud';
        setFilmRenderer('cloud');
        await planScene(text, asset);
        setResultReveal({ original: asset.originalImageUri, clean: asset.cleanImageUri, views: VIEW_ORDER.map((l) => ({ label: l, uri: asset.views[l].imageUri })) });
        goStep('result');
      } catch (e) {
        console.error('[Magic3DStudio] scene planning failed', e);
        setError({ message: 'Something went wrong while generating the scene.', retry: () => generateScene(text) });
      } finally {
        setBusy(null);
      }
    },
    [asset, planScene, showToast, goStep],
  );

  /** "Try again" on the 3D-scene-unavailable card: re-requests the scene with the same description (no extra credit). */
  const retryScene = useCallback(() => {
    if (retouchCtxRef.current) {
      markActionStart('retouch_3d_scene');
      retouchCtxRef.current(); // a failed Retouch tries the Retouch again, not a new generation
    } else {
      markActionStart('generate_3d_scene');
      void generateScene(prompt);
    }
  }, [generateScene, prompt]);

  /** Offline fallback: render with the local fixed R3F Film Studio driven by a validated SceneSpec. */
  const switchToLocalPreview = useCallback(async () => {
    setError(null);
    filmRendererRef.current = 'local';
    setFilmRenderer('local');
    if (!asset) return;
    try {
      await planScene(prompt, asset);
    } catch (e) {
      console.error('[Magic3DStudio] local preview failed', e);
      setError({ message: 'Something went wrong while generating the scene.', retry: switchToLocalPreview });
    } finally {
      setBusy(null);
    }
  }, [asset, prompt, planScene]);

  const onSceneStatus = useCallback(
    (s: ScenePreviewStatus, detail?: string) => {
      previewStatusRef.current = s;
      setPreviewStatus(s);
      if (s === 'error') {
        console.error('[Magic3DStudio] scene preview failed:', detail);
        setError({
          message: 'Something went wrong while loading the 3D scene. Check your connection and try again.',
          retry: () => {
            setError(null);
            setReloadKey((k) => k + 1);
          },
          altLabel: 'Offline preview',
          alt: switchToLocalPreview,
        });
      }
    },
    [switchToLocalPreview],
  );

  // Boot with the built-in procedural demo shoe (no assets, no network, no native modules).
  useEffect(() => {
    prepPhoto(DEMO_PRODUCT_URI, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- platform photos ---- */
  useEffect(() => {
    if (!asset) return;
    let alive = true;
    const h = setTimeout(async () => {
      try {
        const imgs = await composePlatformImages(asset, platformOptions.filter((p) => !disabledPlatforms.includes(p.name)), bg);
        if (alive) setPlatformImages(imgs);
      } catch (e) {
        console.error('[Magic3DStudio] platform compose failed', e);
        if (alive) setPlatformImages([]);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [asset, platformOptions, disabledPlatforms, bg]);

  /* ---- photo inputs ---- */
  const pickPhoto = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!res.canceled && res.assets?.[0]?.uri) prepPhoto(res.assets[0].uri);
    } catch (e) {
      console.error('[Magic3DStudio] pick failed', e);
      setError({ message: 'Something went wrong while opening your gallery.', retry: pickPhoto });
    }
  }, [prepPhoto]);

  /** Tour step 1: iOS cannot present the picker over a Modal, so hide the tour, pick, then bring it back. */
  const pickTourImage = useCallback(async (): Promise<string | null> => {
    setTourOpen(false);
    await sleep(450);
    let uri: string | null = null;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!res.canceled && res.assets?.[0]?.uri) uri = res.assets[0].uri;
    } catch (e) {
      console.error('[Magic3DStudio] tour pick failed', e);
    }
    setTourOpen(true);
    return uri;
  }, []);

  const takePhoto = useCallback(async () => {
    try {
      // const perm = await ImagePicker.requestCameraPermissionsAsync();
      // if (!perm.granted) {
      //   showToast('Camera permission is needed to take a photo');
      //   return;
      // }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!res.canceled && res.assets?.[0]?.uri) prepPhoto(res.assets[0].uri);
    } catch (e) {
      console.error('[Magic3DStudio] camera failed (simulators have no camera)', e);
      showToast('Camera unavailable here - try Pick Photo');
    }
  }, [prepPhoto, showToast]);

  const pickBgImage = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!res.canceled && res.assets?.[0]?.uri) setBg({ kind: 'image', uri: res.assets[0].uri });
    } catch (e) {
      console.error('[Magic3DStudio] bg pick failed', e);
    }
  }, []);

  /* ---- mode / presets / export ---- */
  const switchMode = useCallback((m: 'film' | 'camera') => {
    setMode(m);
    setScene((s) => applyMode(s, m));
  }, []);

  /* ---- credits ---- */
  const ensureDeviceId = useCallback(async () => {
    if (!deviceIdRef.current) deviceIdRef.current = await getDeviceUUID();
    return deviceIdRef.current;
  }, []);

  // On launch: show the cached balance immediately, then refresh from the API.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = await ensureDeviceId();
        const cached = await loadCachedCredits(); // instant first paint; may be empty if expo-sqlite was wiped
        if (alive && cached) setCredits(cached);
        // The backend is the source of truth: read it and overwrite expo-sqlite with it. If it cannot be reached, try again
        // a few times before settling for the cached balance.
        let r = await syncCredits(id);
        for (let attempt = 1; alive && r.source !== 'api' && shouldUseRealCredit() && attempt <= 3; attempt++) {
          if (alive) {
            setCredits(r.credits);
            setCreditSource(r.source);
          }
          await sleep(4000 * attempt);
          if (!alive) return;
          r = await syncCredits(id);
        }
        if (!alive) return;
        setCredits(r.credits);
        setCreditSource(r.source);
      } catch (e) {
        console.error('[Magic3DStudio] initial credit sync failed', e);
      } finally {
        if (alive) setCreditsSyncing(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ensureDeviceId]);

  // Daily reset: re-check when the app returns to the foreground on a new day, and at the next midnight while it is open.
  const creditDayRef = useRef(todayKey());
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = async () => {
      if (!alive || creditBusyRef.current) return;
      try {
        const id = await ensureDeviceId();
        const r = await syncCredits(id);
        if (!alive) return;
        creditDayRef.current = todayKey();
        setCredits(r.credits);
        setCreditSource(r.source);
      } catch (e) {
        console.warn('[Magic3DStudio] daily credit refresh failed', e);
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refresh().finally(schedule);
      }, msUntilMidnight() + 1500);
    };
    schedule();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && creditDayRef.current !== todayKey()) refresh();
      if (st === 'active') schedule();
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [ensureDeviceId]);

  const loadPacks = useCallback(async () => {
    setPacksLoading(true);
    setCreditsError(null);
    try {
      const id = await ensureDeviceId();
      setCreditPacks(await Purchasing.packs(id));
    } catch (e) {
      console.error('[Magic3DStudio] loading credit packs failed', e);
      setCreditsError('The store is unavailable right now. Please try again.');
    } finally {
      setPacksLoading(false);
    }
  }, [ensureDeviceId]);

  const openCredits = useCallback(() => {
    setCreditsOpen(true);
    setCreditsError(null);
    // the flag decides which sheet shows; the packs are only fetched when the store modal is going to be used
    void readShowRevenueCat().then((v) => {
      setShowRevenueCat(v);
      if (v && creditPacks.length === 0) loadPacks();
    });
  }, [creditPacks.length, loadPacks]);

  /** Re-checks the balance with the API, then charges `cost` credits (1, or 2 for an Advanced scene). Returns false (and opens the top-up sheet) if not enough are left. */
  const spendCredit = useCallback(
    async (action: CreditAction, cost = 1): Promise<boolean> => {
      if (creditBusyRef.current) return false;
      creditBusyRef.current = true;
      setCreditsSyncing(true);
      try {
        const id = await ensureDeviceId();
        const { credits: fresh, source } = await syncCredits(id);
        setCredits(fresh);
        setCreditSource(source);
        if (!hasCredit(fresh, cost)) {
          if (cost > 1 && hasCredit(fresh)) showToast(`An Advanced scene needs ${cost} credits. Switch to Standard in Settings, or top up.`);
          openCredits();
          return false;
        }
        const after = applySpend(fresh, cost);
        await logCreditUsage(id, action, fresh, after);
        setCredits(after);
        return true;
      } catch (e) {
        console.error('[Magic3DStudio] credit check failed', e);
        showToast('Could not check your credits. Please try again.');
        return false;
      } finally {
        creditBusyRef.current = false;
        setCreditsSyncing(false);
      }
    },
    [ensureDeviceId, openCredits, showToast],
  );

  /** "Generate 3D Scene" buttons: 1 credit per tap (a retry after an error does not charge again). */
  /** Tour step 3: MOCK shows the demo scene; PRODUCTION runs the real generation (loader + reveal animation). */
  const finishTour = useCallback(
    (r: TourResult) => {
      closeTour();
      setPrompt(r.prompt);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      if (GLOBAL_MODE === 'MOCK') {
        (async () => {
          if (r.uri) await prepPhoto(r.uri); // the photo the user picked in the tour, if any
          setSceneHtml(await mockSceneHtml());
          setReloadKey((k) => k + 1);
          goStep('result');
          setRevealKey((k) => k + 1);
          haptic.success();
          showToast('Demo scene ready');
        })();
      } else if (r.uri) {
        const uri = r.uri;
        (async () => {
          markActionStart('generate_3d_scene');
          const q = qualityRef.current;
          if (!(await spendCredit('generate_3d_scene', sceneQualityCost(q)))) return;
          jobQualityRef.current = q; // the quality that was charged is the one written into the file name
          runPipeline(uri, r.prompt);
        })();
      } else {
        showToast('Add a product photo to start');
      }
    },
    [closeTour, goStep, prepPhoto, runPipeline, showToast, spendCredit],
  );

  const onGenerate = useCallback(
    async (text: string) => {
      if (busy) return;
      if (!asset) {
        showToast('Add a product photo first');
        return;
      }
      markActionStart('generate_3d_scene'); // the log's elapsed time starts at the click
      const q = qualityRef.current;
      if (!(await spendCredit('generate_3d_scene', sceneQualityCost(q)))) return;
      jobQualityRef.current = q; // the quality that was charged is the one written into the file name
      goStep('result'); // the loader and the building animation live on the Result step
      await generateScene(text);
    },
    [asset, busy, generateScene, goStep, showToast, spendCredit],
  );

  /** Retouch: sends the saved page + scene spec + scene image to the cloud and shows the retouched page when it comes back. */
  // Set the instant Retouch is tapped, until the Library sheet closes: LibrarySheet shows a progress visual meanwhile.
  const [retouchPrep, setRetouchPrep] = useState<{ thumb?: string } | null>(null);
  const retouchPrepRef = useRef(false);
  const retouchLibraryItemInner = useCallback(
    async (item: LibraryItem) => {
      if (item.kind !== 'scene') return;
      markActionStart('retouch_3d_scene'); // elapsed time of the log starts at the click
      const p = await libraryPayload<ScenePayload>(item.id);
      if (!p) return showToast('This item is no longer available');
      let spec: string | null = null;
      let html: string | null = p.html || null;
      try {
        if (p.specPath) {
          const f = new File(p.specPath);
          if (f.exists) spec = await f.text();
        }
        if (p.htmlPath) {
          const f = new File(p.htmlPath);
          if (f.exists) html = await f.text();
        }
      } catch (e) {
        console.warn('[Magic3DStudio] retouch: could not read the saved files', e);
      }
      if (!spec || !html || !p.names?.key) {
        haptic.warning();
        showToast('Not enough data to Retouch');
        return;
      }
      if (!(await spendCredit('retouch_3d_scene'))) return; // 1 credit, like generating a 3D scene (a retry after a failure is not charged again)
      const key = p.names.key;
      const specText = spec;
      // the history this Retouch continues: the item's own versions, or just the Original for an item that was never retouched
      const parentVersions: SceneVersion[] = p.versions?.length ? p.versions : [{ label: 'Original', created: item.created, thumb: item.thumb, htmlPath: p.htmlPath, specPath: p.specPath }];
      const pageHtml = html;
      setLibraryOpen(false);
      setRetouchPrep(null); // the sheet is closing: the progress visual has done its job
      // Best effort: show the scene in the preview, wait until it is drawn and snapshot it (extra file for the Retouch).
      // Only when the backend flag 'istakesnapshotforretouch' is true (default / fallback false).
      // Best picture we still have for this old item: the scene image, else a product angle, else the stored front view.
      const sceneImage = p.cloud?.scene ?? p.cloud?.front ?? p.asset?.views?.front ?? undefined;
      let snapshotUri: string | null = null;
      // Any failure here (module missing / not linked, snapshot error, timeout) just leaves snapshotUri null: the snapshot is skipped and
      // the Retouch uploads the scene image, html, json and text files exactly as usual.
      const takeSnapshot = isMockMode() ? false : await readIsTakeSnapshotForRetouch();
      console.log(`[Magic3DStudio] retouch: snapshotlib=${snapshotLib}, istakesnapshotforretouch=${takeSnapshot}${isMockMode() ? ' (MOCK: the scene image stands in for the snapshot)' : ''}`);
      if (isMockMode()) {
        snapshotUri = sceneImage ?? null; // MOCK: no recorder needed, so the whole flow (incl. the snapshot upload) can be tested
      } else if (takeSnapshot) {
        // 1. the Library overlay must be gone (it is a Modal that covers the preview) and fullscreen off, so the preview is really on screen
        setLibraryOpen(false);
        setFullscreen(false);
        // 2. show the scene in the 3D preview on the Result step
        restoreSceneItem(item, p);
        previewStatusRef.current = 'loading';
        setPreviewStatus('loading');
        savedHtmlRef.current = pageHtml;
        setSceneHtml(pageHtml);
        setReloadKey((k) => k + 1);
        goStep('result');
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        try {
          await sleep(700); // let the Library modal finish dismissing (slide animation) before the canvas is captured
          // 3. wait until the preview reports ready (the snapshot api is registered by the SnapshotFrame of the selected lib)
          const t0 = Date.now();
          while (previewStatusRef.current !== 'ready' && Date.now() - t0 < 12000) await sleep(200);
          if (previewStatusRef.current === 'ready') {
            // 4. give the WebGL canvas a few seconds to draw the scene: an early snapshot comes out black (both libraries)
            await sleep(SNAPSHOT_RENDER_DELAY_MS);
            if (snapshotApiRef.current.snapshot) {
              snapshotUri = await withTimeout(snapshotApiRef.current.snapshot() ?? Promise.resolve(null), 8000);
            } else {
              console.warn(`[Magic3DStudio] retouch: snapshot lib '${snapshotLib}' is not available (not installed / not linked) - skipping the snapshot`);
            }
          }
        } catch (e) {
          console.warn('[Magic3DStudio] retouch: could not snapshot the 3D view (continuing without it)', e);
        }
        console.log(`[Magic3DStudio] retouch: 3D snapshot ${snapshotUri ? 'ready' : 'skipped'}`);
      }
      restoreSceneItem(item, p, { pending: true });
      goStep('result');
      const run = async () => {
        setError(null);
        setSceneHtml(null);
        setSceneUnavailable(false);
        setScenePending(true);
        const signal = { aborted: false };
        angleRun.current.aborted = true;
        angleRun.current = signal;
        let logImage: string | undefined;
        try {
          const rn = buildRetouchNames(key, await getDeviceUUID());
          const jobId = uid();
          logImage = `public/scenes/${jobId}/${rn.imageFile}`;
          setRetouchStage('uploading'); // non-blocking: only the preview canvas shows the animation
          // best picture we still have for this old item: the scene image, else a product angle, else the stored front view, else the snapshot just taken
          const retouchImage = sceneImage ?? snapshotUri ?? undefined;
          if (shouldUseRealUpload()) await uploadRetouchInputs(jobId, rn, pageHtml, specText, item.prompt, retouchImage, snapshotUri);
          if (signal.aborted) return;
          setRetouchStage('retouching');
          const job: SceneJob = {
            jobId,
            ok: true,
            startedAt: Date.now(),
            names: { base: p.names!.base, key, angles: [], imageFile: rn.imageFile, promptFile: '', htmlFile: rn.resultHtml, specFile: rn.resultSpec, angleFile: () => '' },
          };
          sceneJobRef.current = job;
          specUriRef.current = null;
          savedItemRef.current = null;
          setCanvasItem(null);
          void watchSceneSpec(job, { signal }, (uri) => attachSpecRef.current?.(jobId, uri)); // best effort: lets the retouched page be retouched again
          const out = await get3DScene(job, { signal });
          if (signal.aborted) return;
          void logActionDetail({ action: 'retouch_3d_scene', prompt: item.prompt, imagePath: logImage });
          retouchedRef.current = true;
          setRetouchStage(null);
          setBeforeHtml(pageHtml); // the page that was sent: shown against the result
          parentVersionsRef.current = parentVersions;
          // Show the "Versions" timeline now, from what is already in memory. It must not wait for the Library save (file copies and image
          // encoding), which can be slow or fail on some devices; the save replaces these entries with the stored files a moment later.
          {
            const early: SceneVersion[] = [...parentVersions, { label: `Retouch ${parentVersions.length}`, created: Date.now(), thumb: parentVersions[0]?.thumb ?? item.thumb }];
            console.log(`[Magic3DStudio] versions timeline: ${early.length} versions`);
            setVersions(early);
            setVersionIdx(early.length - 1);
          }
          setRetouchReveal(true); // light-curtain reveal, then the divider rests at 50 %
          setCompareOn(true);
          setSceneHtml(out);
          setReloadKey((k) => k + 1);
          setScenePending(false);
          haptic.success();
          showToast('Retouched 3D scene ready');
        } catch (e) {
          if (signal.aborted) return;
          void logActionDetail({ action: 'retouch_3d_scene', prompt: item.prompt, imagePath: logImage }); // timeout or failure
          console.warn('[Magic3DStudio] retouch failed', e);
          setRetouchStage(null);
          setScenePending(false);
          setSceneUnavailable(true);
          haptic.warning();
          showToast('The retouched scene is not available');
        }
      };
      retouchCtxRef.current = () => void run();
      await run();
    },
    [goStep, restoreSceneItem, showToast, spendCredit, snapshotLib],
  );
  const retouchLibraryItem = useCallback(
    async (item: LibraryItem) => {
      if (item.kind !== 'scene' || retouchPrepRef.current) return; // a second tap while preparing is ignored
      retouchPrepRef.current = true;
      haptic.tap();
      setRetouchPrep({ thumb: item.thumb });
      try {
        await retouchLibraryItemInner(item);
      } finally {
        retouchPrepRef.current = false;
        setRetouchPrep(null);
      }
    },
    [retouchLibraryItemInner],
  );

  /** Timeline tap: loads that version's page from its saved file; Before / After then compares it with the version before. */
  const selectVersion = useCallback(
    async (i: number) => {
      const v = versions[i];
      if (!v || i === versionIdx) return;
      const html = await readTextFile(v.htmlPath);
      if (!html) {
        haptic.warning();
        showToast('This version is no longer available');
        return;
      }
      const prev = i > 0 ? await readTextFile(versions[i - 1].htmlPath) : null;
      haptic.select();
      savedHtmlRef.current = html; // already in the Library
      setVersionIdx(i);
      setRetouchReveal(false);
      setCompareOn(false);
      setBeforeHtml(prev);
      setSceneHtml(html);
      setReloadKey((k) => k + 1);
    },
    [versions, versionIdx, showToast],
  );

  const buyPack = useCallback(
    async (pack: CreditPack) => {
      setPurchasing(true);
      setCreditsError(null);
      try {
        const id = await ensureDeviceId();
        const before = creditsRef.current?.total ?? 0;
        if ((await Purchasing.purchase(pack, id)) === 'cancelled') return;
        // Credits are granted server-side: re-read the API (the webhook can lag a little).
        let latest = creditsRef.current;
        for (let i = 0; i < 4; i++) {
          const r = await syncCredits(id);
          latest = r.credits;
          setCredits(r.credits);
          setCreditSource(r.source);
          if (r.source === 'api' && r.credits.total > before) break;
          await sleep(1500);
        }
        if (latest && latest.total > before) {
          showToast(`+${latest.total - before} credits added`);
          setCreditsOpen(false);
        } else {
          showToast('Purchase complete. Your credits will appear shortly.');
          setCreditsOpen(false);
        }
      } catch (e) {
        console.error('[Magic3DStudio] purchase failed', e);
        setCreditsError('The purchase could not be completed. Please try again.');
      } finally {
        setPurchasing(false);
      }
    },
    [ensureDeviceId, showToast],
  );

  const restorePurchases = useCallback(async () => {
    setPurchasing(true);
    setCreditsError(null);
    try {
      const id = await ensureDeviceId();
      await Purchasing.restore(id);
      const r = await syncCredits(id);
      setCredits(r.credits);
      setCreditSource(r.source);
      showToast('Purchases restored');
    } catch (e) {
      console.error('[Magic3DStudio] restore failed', e);
      setCreditsError('Could not restore purchases. Please try again.');
    } finally {
      setPurchasing(false);
    }
  }, [ensureDeviceId, showToast]);

  const selectPreset = useCallback(
    (i: number) => {
      setPresetIdx(i);
      setPrompt(SCENE_PRESETS[i].prompt);
      onGenerate(SCENE_PRESETS[i].prompt);
    },
    [onGenerate],
  );

  const toggleRecording = useCallback(async () => {
    const st = recStateRef.current;
    if (st === 'starting' || st === 'stopping') return;
    if (st === 'idle') {
      const nothingToRecord = !asset || (mode === 'film' && filmRenderer === 'cloud' && !sceneHtml);
      if (busy || harmonizeJobRef.current || nothingToRecord) {
        showToast('Generate a scene first');
        return;
      }
      setRecState('starting');
      try {
        setPlaying(true);
        // Backend 'isusingrecorder3dcanvas' (default false): film the 3D canvas with react-native-view-recorder for a fixed duration
        // ('recorder3dcanvasduration', default 20 s). Not usable (module missing / not linked, no record()) -> the turbo screen recorder below.
        const canvasRecord = (await readIsUsingRecorder3dCanvas()) ? snapshotApiRef.current.record : undefined;
        if (canvasRecord) {
          const seconds = await readRecorder3dCanvasDuration();
          const fps = Math.min(60, Math.max(10, Math.round(scene.render.fps || 30)));
          recorderKindRef.current = 'canvas';
          setCanvasRecording(true);
          setRecStartedAt(Date.now());
          setRecState('recording');
          showToast(`Recording the 3D canvas for ${seconds}s`);
          try {
            const uri = await canvasRecord({ fps, totalFrames: Math.round(seconds * fps) });
            if (!uri) throw new Error('The recorder returned no file');
            await Sharing.shareAsync(uri);
            showToast('Recording saved');
          } catch (e) {
            console.error('[Magic3DStudio] 3D canvas recording failed', e);
            showToast('Could not save the recording');
          } finally {
            recorderKindRef.current = null;
            setCanvasRecording(false);
            setRecState('idle');
            setRecStartedAt(null);
          }
          return;
        }
        if ((await readIsUsingRecorder3dCanvas()) && !snapshotApiRef.current.record) {
          console.warn('[Magic3DStudio] isusingrecorder3dcanvas is true but react-native-view-recorder cannot record here - using the screen recorder');
        }
        recorderKindRef.current = 'turbo';
        await ScreenRecorder.start({ fps: scene.render.fps });
        setRecStartedAt(Date.now());
        setRecState('recording');
      } catch (e) {
        recorderKindRef.current = null;
        console.error('[Magic3DStudio] start recording failed', e);
        setRecState('idle');
        setError({
          message: 'Something went wrong while starting the recording.',
          retry: () => {
            setError(null);
            toggleRecording();
          },
        });
      }
      return;
    }
    if (recorderKindRef.current === 'canvas') {
      showToast('The 3D canvas recording stops by itself'); // the view recorder has no stop: it runs for the configured duration
      return;
    }
    setRecState('stopping');
    try {
      const uri = await ScreenRecorder.stop();
      await Sharing.shareAsync(uri);
      showToast(ScreenRecorder.isMock() ? `Recording saved: ${uri.split('/').pop()}` : 'Recording saved');
    } catch (e) {
      console.error('[Magic3DStudio] stop recording failed', e);
      showToast('Could not save the recording');
    } finally {
      recorderKindRef.current = null;
      setRecState('idle');
      setRecStartedAt(null);
    }
  }, [asset, busy, filmRenderer, mode, sceneHtml, scene.render.fps, showToast]);

  // Never leave a recording running if the screen unmounts.
  useEffect(
    () => () => {
      if (recStateRef.current === 'recording' && recorderKindRef.current === 'turbo') ScreenRecorder.stop().catch((e) => console.error('[Magic3DStudio] stop on unmount failed', e));
    },
    [],
  );

  /** Camera Studio: photo + 3D product blended at the exact on-screen position, then harmonized by the API. */
  /** `charge`: the credit check running in parallel (Harmonize button). Nothing is sent to the cloud unless it succeeds. */
  const runHarmonize = useCallback(async (charge?: Promise<boolean>) => {
    if (harmonizeBusyRef.current || mode !== 'camera') return;
    const api = captureRef.current;
    if (!asset || busy || !api.takePhoto || !api.snapshotForeground) {
      showToast('Camera is not ready yet');
      return;
    }
    harmonizeBusyRef.current = true;
    const wasPlaying = playingStateRef.current;
    const t0 = Date.now();
    const lap = (what: string) => console.log(`[Magic3DStudio] harmonize timing: ${what} at ${Date.now() - t0} ms`);
    setHarmonizeJob({ stage: 'capturing' });
    try {
      // 1) Grab the product exactly as shown right now, then freeze the animation.
      const fg = api.snapshotForeground();
      if (!fg) throw new Error('Could not read the 3D frame');
      setPlaying(false);
      // 2) Shoot the photo with the same camera that feeds the preview.
      const photo = await api.takePhoto();
      if (!photo) throw new Error('Camera returned no photo');
      lap('photo taken');
      // 3) Blend: same crop + same framing as the preview, so positions match 1:1.
      setHarmonizeJob({ stage: 'blending' });
      await sleep(40); // let the overlay repaint before the (synchronous) image work starts
      const blend = await composeCameraBlend(photo, fg);
      lap('blended + snapshot written');
      // The credit check ran alongside the capture above; only now (before anything is uploaded) do we need its answer.
      if (charge && !(await charge)) return;
      lap('credit confirmed');
      // 4) Harmonize: upload snapshot + prompt, then wait up to 30 s for the result (see harmonizeImage and the test flags).
      setHarmonizeJob({ stage: 'harmonizing', blendedUri: blend.blendedUri });
      const harmonizedUri = await Services.harmonize(blend.blendedUri, blend.maskUri, asset.metadata.category);
      lap('harmonized image ready');
      setShowAfter(true);
      setHarmonized({ blendedUri: blend.blendedUri, harmonizedUri });
      haptic.success();
      saveHarmonizedToLibrary(blend.blendedUri, harmonizedUri);
    } catch (e) {
      console.error('[Magic3DStudio] harmonize failed', e);
      setError({
        message: /not ready after|timed out/i.test(String((e as Error)?.message))
          ? 'Harmonizing is taking longer than expected. Please try again.'
          : 'Something went wrong while harmonizing the photo.',
        retry: () => {
          setError(null);
          runHarmonize(); // a retry does not charge another credit
        },
      });
    } finally {
      harmonizeBusyRef.current = false;
      setHarmonizeJob(null);
      if (wasPlaying) setPlaying(true);
    }
  }, [asset, busy, mode, saveHarmonizedToLibrary, showToast]);

  /** Harmonize button: re-checks the balance, charges 1 credit, then runs the pipeline. */
  const harmonize = useCallback(async () => {
    if (harmonizeBusyRef.current || mode !== 'camera') return;
    if (playing) {
      showToast('Pause the animation to Harmonize');
      return;
    }
    const api = captureRef.current;
    if (!asset || busy || !api.takePhoto || !api.snapshotForeground) {
      showToast('Camera is not ready yet');
      return;
    }
    // Start the credit check (2-3 network calls) and the capture at the same time instead of one after the other.
    markActionStart('harmonize'); // elapsed time of the log starts at the click
    const charge = spendCredit('harmonize');
    await runHarmonize(charge);
  }, [asset, busy, mode, playing, runHarmonize, showToast, spendCredit]);

  // The result sheet is its own Modal: leave fullscreen first so it can present.
  useEffect(() => {
    if (harmonized && fullscreen) setFullscreen(false);
  }, [harmonized, fullscreen]);

  // Harmonize is only available while the animation is paused (while it plays, the app exports video instead).
  const harmonizeSlot = (
    <View style={{ opacity: playing ? 0.45 : 1 }}>
      <HarmonizeButton busy={!!harmonizeJob} onPress={harmonize} />
      {playing && <Pressable style={StyleSheet.absoluteFill} onPress={() => showToast('Pause the animation to Harmonize')} />}
    </View>
  );


  const toggleMotion = useCallback((id: string) => {
    setScene((s) => {
      const pe = s.productEffects ?? { wind: 0, wave: 0, antiGravity: false };
      const cur = pe.motions ?? [];
      return { ...s, productEffects: { ...pe, motions: cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id] } };
    });
  }, []);

  const toggleProductFx = useCallback((k: 'antiGravity' | 'wind' | 'wave') => {
    setScene((s) => {
      const pe = s.productEffects ?? { wind: 0, wave: 0, antiGravity: false };
      return { ...s, productEffects: k === 'antiGravity' ? { ...pe, antiGravity: !pe.antiGravity } : { ...pe, [k]: pe[k] > 0 ? 0 : 0.5 } };
    });
  }, []);

  /* ---- derived ---- */
  const [progressImagesReady, setProgressImagesReady] = useState(false);
  useEffect(() => {
    if (!useGenericProgressImages()) return;
    let alive = true;
    preloadProgressImages().then(() => alive && setProgressImagesReady(true));
    return () => {
      alive = false;
    };
  }, []);
  /**
   * Pictures for the "Building your 3D scene" carousel. The cloud images that have arrived come first; when NONE has arrived:
   * PRODUCTION shows the generic bundled progress images (golden box), MOCK the demo shoe views.
   */
  const progressImages = useMemo<string[]>(() => {
    const order: CloudAngle[] = ['front', 'left', 'right', 'back', 'scene'];
    const arrived = order.map((a) => cloudImages[a]).filter((u): u is string => !!u);
    if (arrived.length) return arrived;
    if (useGenericProgressImages()) {
      const generic = order.map((a) => progressImageUri(a)).filter((u): u is string => !!u);
      if (generic.length) return generic;
    }
    return asset ? VIEW_ORDER.map((l) => asset.views[l].imageUri) : [];
  }, [cloudImages, asset, progressImagesReady]);
  const galleryItems = useMemo<GalleryItem[]>(() => {
    // a cloud-generated angle replaces the local view of the same name; "scene" is an extra image
    // Angles come from the cloud (they are made when the 3D scene is generated), so before that only the ones ticked in Settings
    // get a placeholder tile. The platform images below are drawn locally with Skia as soon as the cut-out exists.
    const views: GalleryItem[] = asset
      ? VIEW_ORDER.filter((l) => !!cloudImages[l] || pendingAngles.includes(l) || failedAngles.includes(l) || angles.includes(l)).map((l) => ({
          kind: 'view' as const,
          key: `v-${l}`,
          label: l,
          uri: cloudImages[l] ?? asset.views[l].imageUri,
          pending: pendingAngles.includes(l),
          failed: failedAngles.includes(l) && !cloudImages[l],
          idle: !cloudImages[l] && !pendingAngles.includes(l) && !failedAngles.includes(l),
        }))
      : [];
    if (asset && cloudImages.scene) views.push({ kind: 'view', key: 'v-scene', label: 'scene', uri: cloudImages.scene });
    else if (asset && pendingAngles.includes('scene')) views.push({ kind: 'view', key: 'v-scene', label: 'scene', uri: asset.cleanImageUri, pending: true });
    else if (asset && failedAngles.includes('scene')) views.push({ kind: 'view', key: 'v-scene', label: 'scene', uri: asset.cleanImageUri, failed: true });
    else if (asset && angles.includes('scene')) views.push({ kind: 'view', key: 'v-scene', label: 'scene', uri: asset.cleanImageUri, idle: true }); // Settings asks for it: reserve the tile until a generation makes it
    const plats: GalleryItem[] = platformImages.map((p) => ({ kind: 'platform', key: `p-${p.name}`, label: p.name, dimension: p.dimension, uri: p.uri }));
    return [...views, ...plats].filter((g) => !removedKeys.includes(g.key));
  }, [asset, platformImages, cloudImages, pendingAngles, failedAngles, removedKeys, angles]);

  /* ---- preview + zip export ---- */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const openPreview = useCallback(
    (key: string) => {
      const i = galleryItems.findIndex((g) => g.key === key);
      if (i < 0) return;
      setGalleryOpen(false); // one modal at a time
      setPreviewIndex(i);
    },
    [galleryItems],
  );
  const exportZip = useCallback(async () => {
    if (zipBusy) return;
    if (!galleryItems.length) {
      showToast('Nothing to export yet');
      return;
    }
    setZipBusy(true);
    try {
      const files = await Promise.all(galleryItems.map((g) => ensureFileUri(g.uri, `magic3d_${g.label}`)));
      const zipUri = await create_zip_from_files(files);
      await shareFile(zipUri, 'application/zip', 'Export product views');
    } catch (e: any) {
      console.warn('[Magic3DStudio] zip export failed', e);
      showToast(e?.message ? String(e.message) : 'Could not create the zip');
    } finally {
      setZipBusy(false);
    }
  }, [galleryItems, showToast, zipBusy]);

  /* ---- studio shelf actions ---- */
  const menuShare = useCallback(async () => {
    if (!menuItem) return;
    try {
      await shareImageFile(menuItem);
    } catch (e: any) {
      showToast(e?.message ? String(e.message) : 'Could not share the image');
    }
  }, [menuItem, showToast]);
  const menuPdf = useCallback(async () => {
    if (!menuItem) return;
    try {
      await exportImageAsPdf(menuItem);
    } catch (e: any) {
      showToast(e?.message ? String(e.message) : 'Could not create the PDF');
    }
  }, [menuItem, showToast]);
  const menuBackground = useCallback(() => {
    if (!menuItem) return;
    setBg({ kind: 'image', uri: menuItem.uri });
    haptic.success();
    showToast(`${menuItem.label} is now the background`);
  }, [menuItem, showToast]);
  const menuCompare = useCallback(() => {
    if (!menuItem) return;
    if (compareA && compareA.key !== menuItem.key) {
      setComparePair([compareA, menuItem]);
      setCompareA(null);
    } else {
      setCompareA(menuItem);
      showToast('Now long-press another image to compare');
    }
  }, [menuItem, compareA, showToast]);
  const menuRemove = useCallback(() => {
    if (!menuItem) return;
    setRemovedKeys((k) => [...k, menuItem.key]);
    if (compareA?.key === menuItem.key) setCompareA(null);
    showToast('Removed. Use Restore at the top of the list to bring it back.');
  }, [menuItem, compareA, showToast]);

  const cardW = (width - 32 - 12) / 2;
  // Larger stage: the compact mode cards above give the preview the room.
  // AR Camera gets a taller view (the flow rail above it is hidden in that mode).
  const previewH = Math.round(mode === 'camera' ? Math.min((width - 32) * 1.3, winH * 0.64) : Math.min((width - 32) * 1.12, winH * 0.56));
  /** Preview card: inset from the screen edges (the page already pads 16), with a calm radius instead of the old edge-to-edge 30. */
  const PREVIEW_R = 24;
  // Full-window safe top (used by the fullscreen modals, which start at the window origin).
  const fsTop = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 20) + 6;
  // On screen the host app may already sit below the status bar (its own SafeAreaView / header): only pad what is still needed.
  const probeRef = useRef<View>(null);
  const [startY, setStartY] = useState(0);
  const measureStart = useCallback(() => probeRef.current?.measureInWindow((_x, y) => setStartY(Number.isFinite(y) ? Math.max(0, Math.round(y)) : 0)), []);
  const topPad = Math.max(fsTop - startY, 8);

  // Inside a translucent Modal the system navigation bar overlaps the content and insets can read 0 on Android.
  const fsBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 56 : 0);
  /** Recording controls sit at the very bottom of the fullscreen scene (just above the system bar / home indicator). */
  // Uses fsBottom (not raw insets.bottom): inside the translucent fullscreen Modal Android reports insets.bottom = 0 while the
  // 3-button / gesture navigation bar still overlaps the content, which hid the record button and REC badge behind it.
  const recBottom = fsBottom + 12;

  const recording = recState === 'recording' || recState === 'stopping';
  const stage = (
    <SnapshotFrame key={snapshotLib} api={snapshotApiRef} lib={snapshotLib}>
    <Stage
      asset={asset}
      scene={scene}
      mode={mode}
      playing={playing}
      hd={hd}
      sceneHtml={sceneHtml}
      scenePending={scenePending}
      sceneUnavailable={sceneUnavailable}
      onRetryScene={retryScene}
      onOfflineScene={switchToLocalPreview}
      readyCount={Object.keys(cloudImages).length}
      totalCount={Object.keys(cloudImages).length + pendingAngles.length}
      retouchStage={retouchStage}
      retouchUri={cloudImages.scene ?? cloudImages.front}
      progressImages={progressImages}
      beforeHtml={beforeHtml}
      topInset={fullscreen ? fsTop + 50 : 0}
      // level with the record button (centre line), at the bottom left; hidden while recording so it never covers the recording indicator
      exitCompareBottom={fullscreen ? recBottom + REC_BTN_SIZE / 2 - 16 : 17}
      exitCompareLeft={fullscreen ? REC_EDGE : 12}
      hideExitCompare={recording}
      compareOn={compareOn}
      revealCompare={retouchReveal}
      onToggleCompare={toggleCompare}
      onExitCompare={exitCompare}
      filmRenderer={filmRenderer}
      reloadKey={reloadKey}
      onSceneStatus={onSceneStatus}
      capture={captureRef}
      user={userXformRef}
      view={camView}
    />
    </SnapshotFrame>
  );

  /** No Record button while a 3D scene is generating or Harmonize is running (an active recording keeps its Stop button). */
  const canRetouchCanvas = !!canvasItem && canvasItem.kind === 'scene' && flowStep === 'result' && mode !== 'camera' && !recording && !busy && !harmonizeJob;
  const hideRecordBtn = canvasRecording || (!recording && (!!busy || !!harmonizeJob));

  /* ---- hero preview: auto-hiding glass controls + gyroscope tilt ---- */
  const ui = useRef(new Animated.Value(1)).current;
  const uiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uiShown, setUiShown] = useState(true);
  const autoHide = mode === 'film' && playing && !recording && !busy && !!asset && !fullscreen;
  const autoHideRef = useRef(autoHide);
  autoHideRef.current = autoHide;
  const wakeUi = useCallback(() => {
    if (uiTimer.current) clearTimeout(uiTimer.current);
    setUiShown(true);
    Animated.timing(ui, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    if (autoHideRef.current) {
      uiTimer.current = setTimeout(() => {
        if (!autoHideRef.current) return;
        setUiShown(false);
        Animated.timing(ui, { toValue: 0, duration: 450, useNativeDriver: true }).start();
      }, 3500);
    }
  }, [ui]);
  useEffect(() => {
    wakeUi();
  }, [autoHide, wakeUi]);
  useEffect(
    () => () => {
      if (uiTimer.current) clearTimeout(uiTimer.current);
    },
    [],
  );

  const reduceMotion = useReduceMotion();
  const [tiltOn, setTiltOn] = useState(true);
  const tiltX = useRef(new Animated.Value(0)).current; // -1..1, front/back lean
  const tiltY = useRef(new Animated.Value(0)).current; // -1..1, left/right lean
  useEffect(() => {
    if (!tiltOn || fullscreen || recording || reduceMotion) {
      tiltX.setValue(0);
      tiltY.setValue(0);
      return;
    }
    let sub: { remove: () => void } | null = null;
    try {
      // optional: expo-sensors ships with Expo Go; without it the hero simply stays flat
      const DM = require('expo-sensors').DeviceMotion;
      let base: { b: number; g: number } | null = null;
      let cx = 0;
      let cy = 0;
      DM.setUpdateInterval(50);
      sub = DM.addListener((m: any) => {
        const r = m?.rotation;
        if (!r) return;
        if (!base) base = { b: r.beta, g: r.gamma };
        const tx = clamp((r.beta - base.b) * 1.6, -1, 1);
        const ty = clamp((r.gamma - base.g) * 1.6, -1, 1);
        cx += (tx - cx) * 0.18;
        cy += (ty - cy) * 0.18;
        tiltX.setValue(cx);
        tiltY.setValue(cy);
      });
    } catch {
      /* no sensors available */
    }
    return () => {
      sub?.remove();
      tiltX.setValue(0);
      tiltY.setValue(0);
    };
  }, [tiltOn, fullscreen, recording, reduceMotion, tiltX, tiltY]);

  /** Shares / downloads the generated page; after a Retouch the person picks the retouched (after) or the original (before) page. */
  const shareScenePage = useCallback(
    async (which: 'after' | 'before') => {
      setShareMenu(false);
      const html = which === 'before' ? beforeHtmlRef.current : sceneHtml;
      if (!html) {
        showToast('Nothing to share yet');
        return;
      }
      const base = (sceneJobRef.current?.names?.htmlFile ?? 'magic3d-scene.html').replace(/\.html?$/i, '');
      const name = beforeHtmlRef.current ? `${which === 'before' ? 'before' : 'after'}-${base}` : base;
      try {
        await shareHtmlPage(html, name, which === 'before' ? 'Share the original 3D scene' : beforeHtmlRef.current ? 'Share the retouched 3D scene' : 'Share the 3D scene');
      } catch (e) {
        console.warn('[Magic3DStudio] share scene page failed', e);
        showToast('Could not share the 3D scene');
      }
    },
    [sceneHtml, showToast],
  );
  const canShareScene = mode === 'film' && filmRenderer === 'cloud' && !!sceneHtml && !busy && !scenePending;
  const shareBtn = (
    <Pressable
      onPress={() => {
        haptic.tap();
        if (beforeHtmlRef.current) setShareMenu((v) => !v);
        else shareScenePage('after');
      }}
      accessibilityRole="button"
      accessibilityLabel="Share or download the 3D scene as an HTML page"
      hitSlop={4}
      style={({ pressed }) => ({ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.93 : 1 }] })}
    >
      <LinearGradient colors={t.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
        <Ionicons name="share-social" size={19} color="#fff" />
      </LinearGradient>
    </Pressable>
  );
  const shareRow = (icon: IconName, title: string, sub: string, which: 'after' | 'before') => (
    <Pressable onPress={() => { haptic.tap(); shareScenePage(which); }} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 14, backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'transparent' })}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color="#fff" />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{title}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10.5, fontWeight: '600', marginTop: 1 }}>{sub}</Text>
      </View>
    </Pressable>
  );
  const pill = (text: string, dot?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(20,22,30,0.72)', paddingHorizontal: SP.md, paddingVertical: SP.sm - 1, borderRadius: RADIUS.pill }}>
      {dot && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot }} />}
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
  // While the Before / After compare is on, the AFTER chip sits at the top right (top 48, height 24): start the side icons below it.
  const railTop = compareOn && !!beforeHtml && !!sceneHtml ? 82 : 14;
  const railBtn = (icon: IconName, onPress: () => void, label: string) => (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: TOUCH_MIN, height: TOUCH_MIN, borderRadius: TOUCH_MIN / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? 'rgba(255,255,255,0.2)' : 'transparent' })}
    >
      <Ionicons name={icon} size={22} color="#fff" style={{ textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }} />
    </Pressable>
  );
  const roundBtn = (icon: IconName, onPress: () => void, label?: string) => (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label ?? icon.replace(/-outline$/, '').replace(/-/g, ' ')}
      style={{ width: TOUCH_MIN, height: TOUCH_MIN, borderRadius: RADIUS.md, backgroundColor: 'rgba(20,22,30,0.72)', alignItems: 'center', justifyContent: 'center' }}
    >
      {label ? <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{label}</Text> : <Ionicons name={icon} size={19} color="#fff" />}
    </Pressable>
  );

  const modeCard = (m: 'film' | 'camera', title: string, icon: IconName, colors: [string, string], tint: string) => {
    const active = mode === m;
    return (
      <Pressable
        key={m}
        onPress={() => {
          if (mode !== m) haptic.select();
          switchMode(m);
        }}
        style={{ width: cardW }}
      >
        <LinearGradient
          colors={colors}
          style={{ height: 46, borderRadius: RADIUS.lg, paddingHorizontal: SP.md - 2, flexDirection: 'row', alignItems: 'center', gap: SP.sm, borderWidth: active ? 1.5 : 1, borderColor: active ? tint : t.border, ...elevation(active ? 2 : 1, tint) }}
        >
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: hexToRgba(tint, 0.2), alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={17} color={tint} />
          </View>
          <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontWeight: '800', fontSize: 14 }}>
            {title}
          </Text>
          {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tint }} />}
        </LinearGradient>
      </Pressable>
    );
  };

  const inputCard = (title: string, sub: string, icon: IconName, colors: [string, string], tint: string, onPress: () => void) => (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({ width: cardW, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <LinearGradient colors={colors} style={{ borderRadius: RADIUS.xl, padding: SP.md, flexDirection: 'row', alignItems: 'center', gap: SP.md - 2, borderWidth: 1, borderColor: t.border, ...elevation(1, tint) }}>
        <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: hexToRgba(tint, 0.22), alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={24} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, ...TYPE.title, fontSize: 15 }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: t.textMuted, ...TYPE.caption }}>
            {sub}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
      </LinearGradient>
    </Pressable>
  );

  return (
    <LinearGradient colors={t.bg} style={{ flex: 1 }}>
      <StatusBar barStyle={t.dark ? 'light-content' : 'dark-content'} />
      <View ref={probeRef} collapsable={false} onLayout={measureStart} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1 }} />
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: topPad, paddingHorizontal: 16, paddingBottom: insets.bottom + 28 + kbH }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          {/* Studio mark: a glossy 3D cube on a gradient tile, with a small spark */}
          <View style={{ marginRight: 12, width: 52, height: 52 }}>
            <LinearGradient
              colors={[t.cta[0], t.primary, t.palette[2]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', shadowColor: t.primary, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6, overflow: 'hidden' }}
            >
              <View pointerEvents="none" style={{ position: 'absolute', top: -14, left: -8, width: 46, height: 30, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.28)', transform: [{ rotate: '-18deg' }] }} />
              <CubeIcon size={28} color="#fff" strokeWidth={2.2} />
            </LinearGradient>
            <View style={{ position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 }}>
              <SparkIcon size={12} color={t.palette[3]} strokeWidth={2.6} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>
              Magic <Text style={{ color: t.primary }}>3D</Text> Studio
            </Text>
            <CreditBadge credits={credits} syncing={creditsSyncing} offline={creditSource !== 'api'} onPress={() => (creditIntroSeen.current ? openCredits() : setCreditIntroOpen(true))} />
          </View>
          {SHOW_PROFILE_AVATAR && (
          <View style={{ marginLeft: 8 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: hexToRgba(t.primary, 0.18), alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
              <Ionicons name="person" size={24} color={t.primary} />
            </View>
            <View style={{ position: 'absolute', right: 0, bottom: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: t.success, borderWidth: 2, borderColor: '#fff' }} />
          </View>
          )}
          <Pressable
            onPress={() => {
              refreshLibrary();
              setLibraryOpen(true);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Library"
            style={{ marginLeft: 12 }}
          >
            <Ionicons name="albums-outline" size={26} color={t.text} />
            {libraryItems.length > 0 && (
              <View style={{ position: 'absolute', top: -5, right: -7, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: t.palette[3], alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800' }}>{libraryItems.length > 99 ? '99+' : libraryItems.length}</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => setThemeOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Settings" style={{ marginLeft: 14 }}>
            <Ionicons name="settings-outline" size={26} color={t.text} />
          </Pressable>
        </View>

        {/* Guided flow: Photo -> Scene -> Result */}
        {/* Hidden in AR Camera mode: the camera view gets the room instead */}
        {mode !== 'camera' && <FlowRail step={flowStep} canResult={!!asset && (mode === 'camera' || !!sceneHtml || scenePending || sceneUnavailable || filmRenderer === 'local')} onStep={goStep} />}

        {/* Mode cards */}
        {flowStep !== 'photo' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            {modeCard('film', 'Film Studio', 'film-outline', t.cardFilm, t.tintFilm)}
            {modeCard('camera', 'AR Camera', 'camera-outline', t.cardCamera, t.tintCamera)}
          </View>
        )}

        {flowStep === 'result' && (
          <>
        {/* Preview: an inset card with a soft theme-tinted shadow (outer view), a clipped stage (inner view) and a fine light edge */}
        <View
          style={{
            marginTop: 2,
            borderRadius: PREVIEW_R,
            backgroundColor: t.stageBg[0],
            shadowColor: t.dark ? '#000' : t.primary,
            shadowOpacity: t.dark ? 0.45 : 0.22,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 10 },
            elevation: 9,
          }}
        >
        <Animated.View
          onTouchStart={wakeUi}
          style={{
            height: previewH,
            borderRadius: PREVIEW_R,
            overflow: 'hidden',
            backgroundColor: t.stageBg[0],
            transform: [
              { perspective: 1100 },
              { rotateX: tiltX.interpolate({ inputRange: [-1, 1], outputRange: ['1.8deg', '-1.8deg'] }) },
              { rotateY: tiltY.interpolate({ inputRange: [-1, 1], outputRange: ['-1.8deg', '1.8deg'] }) },
            ],
          }}
        >
          {fullscreen ? (
            <LinearGradient colors={t.stageBg} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="expand-outline" size={30} color={t.textMuted} />
              <Text style={{ color: t.textMuted, marginTop: 6, fontWeight: '600' }}>Playing fullscreen</Text>
            </LinearGradient>
          ) : (
            stage
          )}
          {!fullscreen && asset && mode === 'film' && !busy && (sceneHtml || filmRenderer === 'local') && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateX: tiltY.interpolate({ inputRange: [-1, 1], outputRange: [-12, 12] }) }] }]}>
              <LinearGradient colors={[hexToRgba(t.primary, 0), hexToRgba(t.primary, 0.2)]} style={{ position: 'absolute', left: -20, right: -20, bottom: 0, height: '30%' }} />
              <View style={{ position: 'absolute', bottom: '9%', alignSelf: 'center', width: '52%', height: 22, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.07)' }} />
              <View style={{ position: 'absolute', bottom: '10.5%', alignSelf: 'center', width: '34%', height: 12, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.12)' }} />
            </Animated.View>
          )}
          {mode === 'camera' && !fullscreen && !recording && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {/* soft top / bottom shade so the pill, rail, Harmonize and record button stay readable on any camera feed */}
              <LinearGradient colors={['rgba(8,10,18,0.28)', 'rgba(8,10,18,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '22%' }} />
              <LinearGradient colors={['rgba(8,10,18,0)', 'rgba(8,10,18,0.34)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '26%' }} />
              {/* fine AR viewfinder marks */}
              {([
                { top: 10, left: 10, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 10 },
                { top: 10, right: 10, borderTopWidth: 1.5, borderRightWidth: 1.5, borderTopRightRadius: 10 },
                { bottom: 10, left: 10, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderBottomLeftRadius: 10 },
                { bottom: 10, right: 10, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: 10 },
              ] as ViewStyle[]).map((pos, i) => (
                <View key={i} style={[{ position: 'absolute', width: 18, height: 18, borderColor: 'rgba(255,255,255,0.55)' }, pos]} />
              ))}
            </View>
          )}
          {mode === 'camera' && !fullscreen && asset && <GestureSurface user={userXformRef} pivotY={camPivotY} onChange={markXformDirty} onReset={resetXform} />}
          {!fullscreen && harmonizeJob && <HarmonizeOverlay stage={harmonizeJob.stage} blendedUri={harmonizeJob.blendedUri} />}
          {!recording && (
            <Animated.View style={{ position: 'absolute', top: 14, left: 14, opacity: ui }}>
              {pill(
                busy ? 'Processing…' : mode === 'film' ? (filmRenderer === 'cloud' && previewStatus === 'loading' ? 'Loading 3D…' : filmRenderer === 'local' ? 'Offline preview' : '3D Preview') : 'Live AR',
                busy || (mode === 'film' && filmRenderer === 'cloud' && previewStatus === 'loading') ? '#F5A524' : '#22C55E',
              )}
            </Animated.View>
          )}
          {/* One glass rail: every control shares the same centre line as the record button below it. */}
          {!recording && (
          <Animated.View
            pointerEvents={uiShown ? 'box-none' : 'none'}
            style={{ position: 'absolute', top: railTop, right: 14, width: 56, opacity: ui, transform: [{ translateX: ui.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}
          >
            <View style={{ paddingVertical: 6, alignItems: 'center', gap: 6 }}>
              {canShareScene && shareBtn}
              {railBtn('expand-outline', () => setFullscreen(true), 'Fullscreen')}
              {railBtn(playing ? 'pause' : 'play', () => setPlaying((p) => !p), playing ? 'Pause animation' : 'Play animation')}
              {mode === 'camera' && xformDirty && railBtn('refresh', resetXform, 'Reset product position')}
            </View>
          </Animated.View>
          )}
          {shareMenu && canShareScene && !recording && !!beforeHtml && (
            <>
              <Pressable onPress={() => setShareMenu(false)} accessibilityLabel="Close share menu" style={StyleSheet.absoluteFill} />
              <View style={{ position: 'absolute', top: railTop, right: 78, width: 232, padding: 8, borderRadius: 20, backgroundColor: 'rgba(16,18,28,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '900', letterSpacing: 0.8, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4 }}>SHARE OR DOWNLOAD (.HTML)</Text>
                {shareRow('sparkles', 'Retouched scene', 'The new version (after)', 'after')}
                {shareRow('time-outline', 'Original scene', 'Before the retouch', 'before')}
              </View>
            </>
          )}
          {mode === 'camera' && !recording && !xformDirty && !harmonizeJob && !fullscreen && (
            <View pointerEvents="none" style={{ position: 'absolute', bottom: 70, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(18,20,28,0.55)' }}>
              <Ionicons name="hand-left-outline" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Drag · pinch · rotate · double-tap to reset</Text>
            </View>
          )}
          {mode === 'camera' && !recording ? (
            <View style={{ position: 'absolute', bottom: 12, alignSelf: 'center' }}>
              {harmonizeSlot}
            </View>
          ) : null}
          {!fullscreen && recording && !canvasRecording && recStartedAt !== null && <RecordingOverlay startedAt={recStartedAt} fps={scene.render.fps} compact inset={{ left: REC_EDGE, bottom: 8 + (REC_BTN_SIZE - REC_BADGE_H) / 2 }} />}
          {!fullscreen && !hideRecordBtn && (
            <View style={{ position: 'absolute', right: recording ? REC_EDGE : 12, bottom: recording ? 8 : 12 }}>
              <RecordButton size={recording ? REC_BTN_SIZE : 42} state={recState} onPress={() => {
                haptic.tap();
                toggleRecording();
              }} />
            </View>
          )}
          {!fullscreen && canRetouchCanvas && (
            <View style={{ position: 'absolute', right: 12 + 42 + 10, bottom: 12 }}>
              <RetouchCanvasButton size={42} busy={!!retouchPrep} onPress={() => void retouchLibraryItem(canvasItem!)} />
            </View>
          )}
          {busy && !fullscreen && <GenerationOverlay step={busy.step} label={busy.label} prep={busy.prep} photoUri={genPhoto && !genPhoto.startsWith('demo://') ? genPhoto : asset?.cleanImageUri} />}
          {revealKey > 0 && !fullscreen && !busy && <RevealBurst key={revealKey} colors={[t.primary, t.accent, '#FFFFFF', '#FFD36B', '#FF8FC4']} onDone={() => setRevealKey(0)} />}
          {/* Finish: a very light top sheen and a fine glass edge, drawn above the scene but never blocking touches */}
          <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '16%' }} />
          <View pointerEvents="none" style={{ ...StyleSheet.absoluteFill, borderRadius: PREVIEW_R, borderWidth: 1, borderColor: t.dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)' }} />
        </Animated.View>
        </View>

        {/* Camera Studio controls */}
        {mode === 'camera' && (
          <View style={{ marginTop: 12 }}>
            {asset && <ViewPicker asset={asset} value={camView} onChange={setCamView} />}
            <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>MOTION EFFECTS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Chip label="Anti-gravity" icon="rocket-outline" active={!!scene.productEffects?.antiGravity} onPress={() => toggleProductFx('antiGravity')} />
              <Chip label="Wind" icon="leaf-outline" active={(scene.productEffects?.wind ?? 0) > 0} onPress={() => toggleProductFx('wind')} />
              <Chip label="Wave" icon="pulse-outline" active={(scene.productEffects?.wave ?? 0) > 0} onPress={() => toggleProductFx('wave')} />
              {MOTION_EFFECTS.map((m) => (
                <Chip key={m.id} label={m.label} icon={m.icon} active={!!scene.productEffects?.motions?.includes(m.id)} onPress={() => toggleMotion(m.id)} />
              ))}
            </ScrollView>
          </View>
        )}

          </>
        )}

        {/* Error */}
        {error && (
          <View style={{ marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: hexToRgba(t.danger, 0.1), borderWidth: 1, borderColor: hexToRgba(t.danger, 0.3), flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="alert-circle" size={22} color={t.danger} />
            <Text style={{ flex: 1, color: t.text, fontSize: 13, fontWeight: '600' }}>{error.message}</Text>
            <View style={{ gap: 6 }}>
              <Pressable onPress={error.retry} style={{ backgroundColor: t.danger, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Try Again</Text>
              </Pressable>
              {error.alt && (
                <Pressable onPress={error.alt} style={{ borderWidth: 1, borderColor: t.danger, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, alignItems: 'center' }}>
                  <Text style={{ color: t.danger, fontWeight: '700', fontSize: 12 }}>{error.altLabel ?? 'Alternative'}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Step 2: Scene */}
        {flowStep === 'scene' && (
          <>
            {/* the photo from step 1 */}
            <Surface radius={RADIUS.xl} padding={SP.md} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md, marginTop: SP.sm }}>
              <View style={{ width: 64, height: 64, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: hexToRgba(t.primary, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                {asset ? <Image source={{ uri: asset.cleanImageUri }} style={{ width: 64, height: 64 }} resizeMode="contain" /> : <Skeleton width={64} height={64} radius={RADIUS.md} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, ...TYPE.title, fontSize: 15 }}>{asset?.originalImageUri === DEMO_PRODUCT_URI ? 'Demo shoe' : 'Your product'}</Text>
                <Text style={{ color: t.textMuted, ...TYPE.caption, marginTop: 2 }}>{asset ? 'Background removed · photos ready' : 'Getting the demo ready…'}</Text>
              </View>
              <Pressable onPress={() => goStep('photo')} accessibilityRole="button" accessibilityLabel="Change photo" hitSlop={hitFor(36)} style={{ paddingHorizontal: SP.md, height: 36, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(t.primary, 0.12) }}>
                <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12.5 }}>Change</Text>
              </Pressable>
            </Surface>

            {mode === 'camera' ? (
              <Surface variant="tinted" radius={RADIUS.xl} padding={SP.md} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md, marginTop: SP.lg }}>
                <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(t.primary, 0.14) }}>
                  <Ionicons name="camera-outline" size={22} color={t.primary} />
                </View>
                <Text style={{ flex: 1, color: t.text, fontSize: 13.5, lineHeight: 19 }}>AR Camera places your cut-out product in front of the live camera. No 3D scene or credit needed.</Text>
              </Surface>
            ) : (
              <>
            {/* ideas */}
            <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: SP.lg, marginBottom: 2 }}>START FROM AN IDEA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SP.lg }} contentContainerStyle={{ paddingHorizontal: SP.lg, paddingVertical: SP.sm }}>
              {SCENE_SUGGESTIONS.map((sg, sgi) => (
                <Chip key={sg.label} color={t.palette[sgi % 6]} label={sg.label} icon={sg.icon} active={prompt.trim() === sg.text} onPress={() => { haptic.select(); setPrompt(sg.text); }} />
              ))}
            </ScrollView>

        {/* Describe */}
        <View ref={describeRef} collapsable={false} onLayout={(e) => (describeY.current = e.nativeEvent.layout.y)} style={{ marginTop: SP.xs, borderRadius: RADIUS.xl, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, padding: SP.md, ...elevation(1, t.primary) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ionicons name="create-outline" size={20} color={t.steps[1]} />
            <Text style={{ color: t.steps[1], fontWeight: '700', fontSize: 15 }}>Describe your scene</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              onFocus={() => {
                describeFocused.current = true;
                revealDescribe(); // also covers the keyboard already being open
              }}
              onBlur={() => {
                describeFocused.current = false;
              }}
              multiline
              placeholder="I want to see this product floating on a nice table…"
              placeholderTextColor={t.textMuted}
              style={{ flex: 1, minHeight: 64, maxHeight: 130, color: t.text, fontSize: 15, lineHeight: 21, paddingVertical: 4 }}
            />
            <Pressable onPress={() => onGenerate(prompt)} disabled={!!busy}>
              <LinearGradient colors={t.cta} style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
                {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-forward" size={22} color="#fff" />}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
              </>
            )}

        {/* Demo banner: the app starts on a sample shoe, so say so and invite the user's own photo */}
        {asset?.originalImageUri === DEMO_PRODUCT_URI && (
          <LinearGradient colors={[hexToRgba(t.primary, 0.16), hexToRgba(t.accent, 0.12)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ marginTop: SP.lg, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: hexToRgba(t.primary, 0.3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary }}>
                <Ionicons name="footsteps-outline" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '800', fontSize: 15 }}>You're viewing a demo shoe</Text>
                <Text style={{ color: t.textMuted, fontSize: 12.5, marginTop: 1 }}>Add your own product photo to make it yours.</Text>
              </View>
              <Pressable onPress={openTour} hitSlop={8} accessibilityLabel="Show the welcome tour">
                <Ionicons name="help-circle-outline" size={24} color={t.textMuted} />
              </Pressable>
            </View>
          </LinearGradient>
        )}

          </>
        )}

        {/* Step 1: Photo */}
        {flowStep === 'photo' && (
          <>
            <Surface variant="tinted" radius={RADIUS.xxl} padding={SP.xl} style={{ alignItems: 'center', borderStyle: 'dashed', borderWidth: 1.5, marginTop: SP.xs }}>
              <LinearGradient colors={[t.cta[0], t.primary, t.cta[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 92, height: 92, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', marginBottom: SP.lg, ...elevation(3, t.primary) }}>
                <Ionicons name="images-outline" size={42} color="#fff" />
              </LinearGradient>
              <Text style={{ color: t.text, ...TYPE.headline, textAlign: 'center' }}>Add a photo</Text>
              <Text style={{ color: t.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: SP.sm, maxWidth: 300 }}>We generate beautiful e-commerce photos and 3D scene from a single image.</Text>
              <Pressable onPress={() => { haptic.tap(); pickPhoto(); }} accessibilityRole="button" style={{ alignSelf: 'stretch', marginTop: SP.xl }}>
                <LinearGradient colors={t.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, ...elevation(3, t.cta[0]) }}>
                  <Ionicons name="image-outline" size={21} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16.5 }}>Choose from gallery</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={() => { haptic.tap(); takePhoto(); }} accessibilityRole="button" style={{ alignSelf: 'stretch', marginTop: SP.md, minHeight: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: hexToRgba(t.primary, 0.5), backgroundColor: t.surface }}>
                <Ionicons name="camera-outline" size={21} color={t.primary} />
                <Text style={{ color: t.primary, fontWeight: '800', fontSize: 16 }}>Take a photo</Text>
              </Pressable>
            </Surface>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SP.sm, marginTop: SP.lg }}>
              {(['Plain background works best', 'Good lighting', 'One product'] as const).map((tip) => (
                <View key={tip} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
                  <Ionicons name="checkmark-circle" size={14} color={t.success} />
                  <Text style={{ color: t.textMuted, fontSize: 11.5, fontWeight: '700' }}>{tip}</Text>
                </View>
              ))}
            </View>
            {asset && asset.originalImageUri !== DEMO_PRODUCT_URI && (
              <Pressable onPress={() => goStep('scene')} accessibilityRole="button" style={{ marginTop: SP.lg }}>
                <Surface radius={RADIUS.xl} padding={SP.md} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
                  <Image source={{ uri: asset.cleanImageUri }} style={{ width: 48, height: 48, borderRadius: RADIUS.sm }} resizeMode="contain" />
                  <Text style={{ flex: 1, color: t.text, fontWeight: '800', fontSize: 14 }}>Continue with your current photo</Text>
                  <Ionicons name="arrow-forward" size={18} color={t.primary} />
                </Surface>
              </Pressable>
            )}
            { GLOBAL_MODE === 'MOCK' &&
            <Pressable onPress={() => goStep('scene')} accessibilityRole="button" hitSlop={hitFor(30)} style={{ alignSelf: 'center', marginTop: SP.lg, minHeight: TOUCH_MIN, justifyContent: 'center' }}>
              <Text style={{ color: t.primary, fontWeight: '800', fontSize: 14 }}>No photo handy? Try the demo shoe</Text>
            </Pressable>
            }
          </>
        )}

        {flowStep === 'result' && mode !== 'camera' && versions.length > 1 && <VersionTimeline versions={versions} activeIdx={versionIdx} onSelect={selectVersion} />}

        {/* Result: read-only scene prompt (Film Studio only). A new flow starts from "Select Another Photo". */}
        {flowStep === 'result' && mode !== 'camera' && (
          <View style={{ marginTop: SP.lg, borderRadius: RADIUS.xl, backgroundColor: t.surface, borderWidth: 1, borderColor: hexToRgba(t.tertiary, 0.3), overflow: 'hidden', ...elevation(1, t.tertiary) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingHorizontal: SP.md + 2, paddingVertical: SP.sm + 2, backgroundColor: hexToRgba(t.tertiary, 0.1) }}>
              <LinearGradient colors={[t.tertiary, t.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={12} color="#FFFFFF" />
              </LinearGradient>
              <Text style={{ color: t.text, fontSize: 13, fontWeight: '800' }}>Your scene</Text>
              {SHOW_SCENE_CARD_SUBTITLE && (
                <Text numberOfLines={1} style={{ flex: 1, color: t.textMuted, fontSize: 11.5, fontWeight: '600' }}>· {SCENE_CARD_SUBTITLE}</Text>
              )}
            </View>
            <Text selectable style={{ color: t.text, fontSize: 15, lineHeight: 22, paddingHorizontal: SP.md + 2, paddingTop: SP.md, paddingBottom: SP.md + 2 }}>
              {prompt}
            </Text>
          </View>
        )}

        {flowStep === 'result' && (
          <>
        {!productViewsHidden && (
          <>
        {/* Generated views */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
          <Text style={{ color: t.text, ...TYPE.title }}>Generated Product Views</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={exportZip}
              disabled={zipBusy || !galleryItems.length}
              accessibilityLabel="Export all images as zip"
              hitSlop={8}
              style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, opacity: galleryItems.length ? 1 : 0.4 }}
            >
              {zipBusy ? <ActivityIndicator size="small" color={t.primary} /> : <FileArchive size={18} color={t.primary} strokeWidth={2.2} />}
            </Pressable>
            <Pressable onPress={() => setGalleryOpen(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: t.primary, fontWeight: '700' }}>View all </Text>
              <Ionicons name="chevron-forward" size={16} color={t.primary} />
            </Pressable>
          </View>
        </View>
        <View style={{ height: PV_CARD_H + 20 }}>
          {galleryItems.length > 0 ? (
            <FlashList horizontal data={galleryItems} keyExtractor={(i) => i.key} renderItem={({ item }) => <ProductViewCard item={item} onPress={() => openPreview(item.key)} />} ItemSeparatorComponent={() => <View style={{ width: PV_GAP }} />} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10, paddingHorizontal: 4 }} />
          ) : (
            <Pressable onPress={pickPhoto} style={{ flex: 1, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: hexToRgba(t.primary, 0.5), backgroundColor: hexToRgba(t.primary, 0.05), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 16 }}>
              <View style={{ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(t.primary, 0.15) }}>
                <Ionicons name="add" size={26} color={t.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '800', fontSize: 14.5 }}>Add a photo</Text>
                <Text style={{ color: t.textMuted, fontSize: 12.5, marginTop: 1 }}>Photos appear here; extra angles arrive with your 3D scene.</Text>
              </View>
            </Pressable>
          )}
        </View>

          </>
        )}
          </>
        )}

        {/* CTA: idle -> working -> done */}
        {flowStep !== 'photo' && !(mode === 'camera' && flowStep === 'result') && (() => {
          const working = !!busy;
          const needPhoto = !asset;
          const colors: [string, string] = ctaDone && !working ? ['#34D399', '#10B981'] : t.cta;
          const stepLabel = busy ? busy.label ?? PIPELINE_STEPS[Math.min(busy.step, PIPELINE_STEPS.length - 1)].label : '';
          if (mode === 'camera') {
            // Camera Studio: free, no scene generation - straight to the live camera with the cut-out
            return (
              <Pressable onPress={() => { haptic.tap(); if (asset) goStep('result'); else showToast('Add a product photo first'); }} accessibilityRole="button" style={{ marginTop: SP.lg + 2 }}>
                <LinearGradient colors={t.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: asset ? 1 : 0.55, ...elevation(3, t.cta[0]) }}>
                  <Ionicons name="camera-outline" size={22} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>Open AR Camera</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </LinearGradient>
              </Pressable>
            );
          }
          return (
            <Pressable
              onPress={() => {
                haptic.tap();
                if (flowStep === 'result' && (sceneHtml || scenePending || sceneUnavailable)) startOver();
                else onGenerate(prompt);
              }}
              disabled={working}
              style={{ marginTop: SP.lg + 2 }}
              accessibilityRole="button" accessibilityState={{ busy: working, disabled: needPhoto }}>
              <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16, opacity: needPhoto ? 0.55 : working ? 0.9 : 1, ...elevation(3, colors[0]) }}>
                {working ? (
                  <>
                    <ActivityIndicator color="#fff" />
                    <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '800', fontSize: 16, flexShrink: 1 }}>{stepLabel}…</Text>
                  </>
                ) : ctaDone ? (
                  <>
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>Scene ready</Text>
                  </>
                ) : needPhoto ? (
                  <>
                    <Ionicons name="image-outline" size={22} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>Add a photo to start</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name={flowStep === 'result' && (sceneHtml || scenePending || sceneUnavailable) ? 'image-outline' : 'sparkles-outline'} size={22} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{flowStep === 'result' && (sceneHtml || scenePending || sceneUnavailable) ? 'Select Another Photo' : 'Generate 3D Scene'}</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          );
        })()}
      </ScrollView>

      {busy && flowStep !== 'result' && !fullscreen && (
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient colors={t.bg} style={StyleSheet.absoluteFill} />
          <GenerationOverlay step={busy.step} label={busy.label} prep={busy.prep} photoUri={genPhoto && !genPhoto.startsWith('demo://') ? genPhoto : asset?.cleanImageUri} />
        </View>
      )}

      {/* Fullscreen */}
      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {fullscreen && stage}
          {fullscreen && mode === 'camera' && asset && <GestureSurface user={userXformRef} pivotY={camPivotY} onChange={markXformDirty} onReset={resetXform} />}
          {!recording && (
          <View style={{ position: 'absolute', top: fsTop, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
            {pill(mode === 'film' ? 'Film Studio' : 'AR Camera', '#22C55E')}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {roundBtn(playing ? 'pause' : 'play', () => setPlaying((p) => !p))}
              {roundBtn('close', () => setFullscreen(false))}
            </View>
          </View>
          )}
          {harmonizeJob && <HarmonizeOverlay stage={harmonizeJob.stage} blendedUri={harmonizeJob.blendedUri} />}
          {recording && !canvasRecording && recStartedAt !== null && (
            <RecordingOverlay startedAt={recStartedAt} fps={scene.render.fps} compact inset={{ left: REC_EDGE, bottom: recBottom + (REC_BTN_SIZE - REC_BADGE_H) / 2 }} />
          )}
          {!hideRecordBtn && (
          <View style={{ position: 'absolute', right: REC_EDGE, bottom: recBottom }}>
            <RecordButton size={REC_BTN_SIZE} state={recState} onPress={() => {
                haptic.tap();
                toggleRecording();
              }} />
          </View>
          )}
          {canRetouchCanvas && (
          <View style={{ position: 'absolute', right: REC_EDGE + REC_BTN_SIZE + 10, bottom: recBottom }}>
            <RetouchCanvasButton size={REC_BTN_SIZE} busy={!!retouchPrep} onPress={() => void retouchLibraryItem(canvasItem!)} />
          </View>
          )}
          {!recording && mode === 'camera' && (
          <View style={{ position: 'absolute', bottom: fsBottom + 24, left: 24, right: 24, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {harmonizeSlot}
          </View>
          )}
        </View>
      </Modal>

      {/* Credits: top-up sheet (RevenueCat) */}
      <CreditsResetSheet visible={creditsOpen && !showRevenueCat} credits={credits} onClose={() => setCreditsOpen(false)} />
      <CreditsModal
        visible={creditsOpen && showRevenueCat}
        credits={credits}
        packs={creditPacks}
        loadingPacks={packsLoading}
        purchasing={purchasing}
        error={creditsError}
        mock={GLOBAL_MODE === 'MOCK'}
        onClose={() => setCreditsOpen(false)}
        onBuy={buyPack}
        onRestore={restorePurchases}
        onRetry={loadPacks}
      />

      {/* Harmonize result: before / after slider + share / PDF */}
      <HarmonizeResultSheet result={harmonized} onClose={() => setHarmonized(null)} top={fsTop} bottom={Math.max(insets.bottom, Platform.OS === 'android' ? 56 : 0) + 16} ctaColors={t.cta} mock={GLOBAL_MODE === 'MOCK' && !(ENABLE_TEST_REAL_UPLOAD && ENABLE_TEST_REAL_DOWNLOAD)} />

      <ResultReveal data={resultReveal} onClose={closeResultReveal} />

      <ImagePreviewModal visible={previewIndex !== null} items={galleryItems} startIndex={previewIndex ?? 0} onClose={() => setPreviewIndex(null)} onToast={showToast} />

      {/* Gallery: all views + platform photos + background */}
      <SheetModal visible={galleryOpen} title="Product Views & Platforms" onClose={() => setGalleryOpen(false)}>
        {(() => {
          const SW_NAMES = ['White', 'Sand', 'Sky', 'Blush', 'Mint', 'Ink'];
          const bgHex = bg.kind === 'color' ? bg.color.toUpperCase() : null;
          const swIdx = bgHex ? BG_SWATCHES.findIndex((c) => c.toUpperCase() === bgHex) : -1;
          const custom = bg.kind === 'color' && swIdx < 0;
          const bgName = bg.kind === 'image' ? 'Your photo' : swIdx >= 0 ? SW_NAMES[swIdx] : 'Custom';
          const angleItems = galleryItems.filter((g) => g.kind === 'view' && g.label !== 'scene');
          const sceneItems = galleryItems.filter((g) => g.kind === 'view' && g.label === 'scene');
          const platItems = galleryItems.filter((g) => g.kind === 'platform');
          const viewCount = angleItems.length + sceneItems.length;
          const stickyBg = hexToRgba(t.bg[0], 0.97);
          const header = (icon: IconName, label: string, count: number, hc: string = t.primary) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingVertical: SP.sm, backgroundColor: stickyBg }}>
              <View style={{ width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(hc, 0.14) }}>
                <Ionicons name={icon} size={16} color={hc} />
              </View>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{label}</Text>
              <View style={{ paddingHorizontal: 9, paddingVertical: 2, borderRadius: 10, backgroundColor: hexToRgba(hc, 0.14) }}>
                <Text style={{ color: hc, fontWeight: '800', fontSize: 12 }}>{count}</Text>
              </View>
            </View>
          );
          const GRID_GAP = SP.md;
          const gridW = Math.floor(((galleryW || width - SP.lg * 2) - GRID_GAP) / 2);
          // two columns, every image visible at once (no sideways scrolling)
          const shelf = (items: GalleryItem[]) => {
            const rows: GalleryItem[][] = [];
            for (let n = 0; n < items.length; n += 2) rows.push(items.slice(n, n + 2));
            return (
              <View style={{ paddingTop: SP.xs, paddingBottom: SP.md }}>
                {rows.map((row) => (
                  <View key={row[0].key} style={{ flexDirection: 'row', gap: GRID_GAP, marginBottom: GRID_GAP }}>
                    {row.map((item) => (
                      <GridCard key={item.key} item={item} width={gridW} marked={compareA?.key === item.key} onOpen={openPreview} onMenu={setMenuItem} />
                    ))}
                  </View>
                ))}
              </View>
            );
          };
          const blocks: { key: string; node: ReactNode; sticky?: boolean }[] = [];
          blocks.push({
            key: 'bg',
            node: (
              <Surface style={{ marginBottom: SP.lg }} padding={14} radius={22}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Ionicons name="color-fill-outline" size={17} color={t.palette[4]} />
                  <Text style={{ color: t.text, fontSize: 15, fontWeight: '800', marginLeft: 8, flex: 1 }}>Background</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: hexToRgba(t.primary, 0.1) }}>
                    {bg.kind === 'color' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: bg.color, borderWidth: 1, borderColor: t.border }} />}
                    <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12 }}>{bgName}{bgHex && custom ? ` ${bgHex}` : ''}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {BG_SWATCHES.map((c, i) => {
                    const on = swIdx === i;
                    const lightSw = c.toUpperCase() !== '#1B1F2A';
                    return (
                      <Pressable key={c} onPress={() => { haptic.select(); setBg({ kind: 'color', color: c }); }} accessibilityRole="button" accessibilityLabel={`${SW_NAMES[i]} background`} accessibilityState={{ selected: on }} hitSlop={hitFor(38)}>
                        <View style={{ width: 38, height: 38, borderRadius: 19, padding: 3, borderWidth: 2, borderColor: on ? t.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          <View style={{ flex: 1, alignSelf: 'stretch', borderRadius: 16, backgroundColor: c, borderWidth: 1, borderColor: lightSw ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                            {on && <Ionicons name="checkmark" size={15} color={lightSw ? '#222' : '#fff'} />}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                  <Pressable onPress={() => { haptic.select(); pickBgImage(); }} accessibilityRole="button" accessibilityLabel="Use a photo as background" hitSlop={hitFor(38)}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: bg.kind === 'image' ? 2 : 1, borderColor: bg.kind === 'image' ? t.primary : t.border, backgroundColor: bg.kind === 'image' ? hexToRgba(t.primary, 0.12) : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="image-outline" size={18} color={bg.kind === 'image' ? t.primary : t.text} />
                    </View>
                  </Pressable>
                  <Pressable onPress={() => { haptic.select(); setPickerOpen((o) => !o); }} accessibilityRole="button" accessibilityLabel="Custom colour" hitSlop={hitFor(38)}>
                    <LinearGradient colors={[...HUE_STOPS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 38, height: 38, borderRadius: 19, padding: custom || pickerOpen ? 3 : 4, borderWidth: custom || pickerOpen ? 2 : 0, borderColor: t.primary }}>
                      <View style={{ flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: custom ? (bg as { color: string }).color : 'rgba(255,255,255,0.92)' }}>
                        <Ionicons name={pickerOpen ? 'chevron-up' : 'color-palette'} size={14} color={custom ? '#fff' : '#333'} />
                      </View>
                    </LinearGradient>
                  </Pressable>
                </View>
                {pickerOpen && (
                  <View style={{ marginTop: 14 }}>
                    <ColorPickerPanel value={bg.kind === 'color' ? bg.color : '#FFFFFF'} onCommit={(c) => setBg({ kind: 'color', color: c })} />
                  </View>
                )}
              </Surface>
            ),
          });
          blocks.push({
            key: 'filters',
            node: (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SP.xs }}>
                <Chip label={`All ${galleryItems.length}`} icon="apps-outline" active={galleryFilter === 'all'} onPress={() => setGalleryFilter('all')} />
                <Chip color={t.palette[2]} label={`Views ${viewCount}`} icon="cube-outline" active={galleryFilter === 'views'} onPress={() => setGalleryFilter('views')} />
                <Chip color={t.palette[3]} label={`Platforms ${platItems.length}`} icon="storefront-outline" active={galleryFilter === 'platforms'} onPress={() => setGalleryFilter('platforms')} />
                {removedKeys.length > 0 && (
                  <Pressable onPress={() => setRemovedKeys([])} hitSlop={hitFor(30)} accessibilityRole="button" accessibilityLabel="Restore removed images" style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="arrow-undo-outline" size={15} color={t.primary} />
                    <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12.5 }}>Restore {removedKeys.length}</Text>
                  </Pressable>
                )}
              </View>
            ),
          });
          if (compareA) {
            blocks.push({
              key: 'cmp',
              node: (
                <Surface variant="tinted" radius={RADIUS.lg} padding={SP.md} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginVertical: SP.sm }}>
                  <Ionicons name="git-compare-outline" size={18} color={t.primary} />
                  <Text style={{ flex: 1, color: t.text, fontWeight: '700', fontSize: 13 }}>
                    Comparing <Text style={{ color: t.primary, textTransform: 'capitalize' }}>{compareA.label}</Text>. Long-press another image.
                  </Text>
                  <Pressable onPress={() => setCompareA(null)} hitSlop={hitFor(30)} accessibilityRole="button" accessibilityLabel="Cancel compare">
                    <Text style={{ color: t.primary, fontWeight: '800', fontSize: 13 }}>Cancel</Text>
                  </Pressable>
                </Surface>
              ),
            });
          }
          if (galleryFilter !== 'platforms') {
            if (angleItems.length) {
              blocks.push({ key: 'h-angles', sticky: true, node: header('cube-outline', 'Angles', angleItems.length) });
              blocks.push({ key: 's-angles', node: shelf(angleItems) });
            }
            if (sceneItems.length) {
              blocks.push({ key: 'h-scene', sticky: true, node: header('image-outline', 'Scene', sceneItems.length, t.palette[2]) });
              blocks.push({ key: 's-scene', node: shelf(sceneItems) });
            }
            if (!angleItems.length && !sceneItems.length) {
              blocks.push({ key: 'e-views', node: <EmptyState icon="cube-outline" title="No photos yet" body="Pick or take a photo and your generated images appear here." /> });
            }
          }
          if (galleryFilter !== 'views') {
            blocks.push({ key: 'h-plat', sticky: true, node: header('storefront-outline', 'Platforms', platItems.length, t.palette[3]) });
            blocks.push({
              key: 's-plat',
              node: platItems.length ? shelf(platItems) : <EmptyState icon="images-outline" title="No platform images yet" body="They appear here after you generate them." />,
            });
          }
          return (
            <>
              <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }} onLayout={(e) => setGalleryW(Math.floor(e.nativeEvent.layout.width))} stickyHeaderIndices={blocks.map((b, i) => (b.sticky ? i : -1)).filter((i) => i >= 0)} contentContainerStyle={{ paddingBottom: 6 }}>
                {blocks.map((b) => (
                  <View key={b.key}>{b.node}</View>
                ))}
              </ScrollView>
              <ItemActionSheet
                item={menuItem}
                compareWith={compareA}
                canRemove
                onClose={() => setMenuItem(null)}
                onShare={menuShare}
                onPdf={menuPdf}
                onBackground={menuBackground}
                onCompare={menuCompare}
                onRemove={menuRemove}
              />
              <CompareModal pair={comparePair} onClose={() => setComparePair(null)} />
            </>
          );
        })()}
      </SheetModal>

      <LibrarySheet visible={libraryOpen} items={libraryItems} loading={libraryLoading} onClose={() => setLibraryOpen(false)} onOpen={openLibraryItem} onChange={refreshLibrary} onToast={showToast} showRetouch={showRetouch} onRetouch={retouchLibraryItem} retouchPrep={retouchPrep} />

      <WelcomeTour visible={tourOpen} sessionKey={tourSession} mock={GLOBAL_MODE === 'MOCK'} onClose={closeTour} pickImage={pickTourImage} onFinish={finishTour} />
      <CreditIntroSheet
        visible={creditIntroOpen}
        credits={credits}
        onClose={closeCreditIntro}
        onMore={() => {
          closeCreditIntro();
          setTimeout(openCredits, 350);
        }}
      />

      {/* Settings: platforms + themes */}
      <SettingsSheet
        visible={themeOpen}
        themeId={themeId}
        setThemeId={setThemeId}
        onClose={() => setThemeOpen(false)}
        platforms={platformOptions}
        disabledPlatforms={disabledPlatforms}
        setDisabledPlatforms={setDisabledPlatforms}
        angles={angles}
        setAngles={setAngles}
        quality={quality}
        setQuality={setQuality}
        onTour={() => {
          setThemeOpen(false);
          setTimeout(openTour, 350);
        }}
      />

      {toast && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: insets.bottom + 90, alignSelf: 'center', backgroundColor: 'rgba(20,22,30,0.92)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, maxWidth: '86%' }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{toast}</Text>
        </View>
      )}
    </LinearGradient>
  );
}

// @react-three/fiber still creates a THREE.Clock internally and recent three.js logs a deprecation warning for it on
// every Canvas. We never use THREE.Clock ourselves, so hide exactly that one message (all other warnings still show).
// The real fix is upgrading @react-three/fiber / three together; remove this block after that.
if (__DEV__ && !(console.warn as any).__m3dFiltered) {
  const originalWarn = console.warn;
  const filtered = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('THREE.Clock: This module has been deprecated')) return;
    originalWarn(...args);
  };
  (filtered as any).__m3dFiltered = true;
  console.warn = filtered;
}

/* ---- dev-time guard: capabilities contract must match registries ---- */
if (__DEV__) {
  const missing = (list: string[], reg: Record<string, unknown>, name: string) =>
    list.filter((k) => !(k in reg)).forEach((k) => console.warn(`[Magic3DStudio] capability "${k}" has no ${name} registry entry`));
  missing(FILM_STUDIO_CAPABILITIES.environments, ENVIRONMENT_REGISTRY, 'environment');
  missing(FILM_STUDIO_CAPABILITIES.cameraTypes, CAMERA_REGISTRY, 'camera');
  missing(FILM_STUDIO_CAPABILITIES.animations, ANIMATION_REGISTRY, 'animation');
  missing(FILM_STUDIO_CAPABILITIES.lightingPresets, LIGHTING_REGISTRY, 'lighting');
}

/** expo-sqlite key of the chosen theme (kv table). Retired ids saved by an older build still resolve through LEGACY_THEME_ALIASES. */
const THEME_KV_KEY = 'theme_v1';

export default function Magic3DStudio() {
  const [themeId, setThemeIdState] = useState(DEFAULT_THEME_ID);
  // The saved theme is read before the first screen is drawn, so the app never flashes the default theme and then jumps.
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await kvGet(THEME_KV_KEY);
        if (alive && saved) setThemeIdState(resolveTheme(saved).id);
      } catch {
        /* keep the default theme */
      }
      if (alive) setThemeReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);
  /** Applies a theme and saves it to expo-sqlite, so it is still there after the app is closed and reopened. */
  const setThemeId = useCallback((id: string) => {
    const next = resolveTheme(id).id;
    setThemeIdState(next);
    kvSet(THEME_KV_KEY, next).catch(() => undefined);
  }, []);
  const theme = resolveTheme(themeId);
  if (!themeReady) return <View style={{ flex: 1, backgroundColor: THEME_REGISTRY[DEFAULT_THEME_ID].bg[0] }} />;
  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={theme}>
        <StudioScreen themeId={themeId} setThemeId={setThemeId} />
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

export {
  CameraStudio, DEFAULT_SCENE_SPEC, FILM_STUDIO_CAPABILITIES, FilmStudio, getDeviceCredits, getDeviceUUID, registerThemes,
  resolveTheme, themeFromHue, validateSceneSpec
};
export type { DepthMaps, FilmStudioCapabilities, ProductAsset, ProductMetadata, ProductViews, SceneSpec };