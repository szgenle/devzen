import type { EcosystemId } from '@shared/types';

/**
 * Ecosystem marker 与可清理目录定义。
 * 参考 DevAtlasMac 思路：通过项目根的标志文件识别项目类型，
 * 进而推断该类型的标准构建产物目录。
 */

export interface EcosystemSpec {
  id: EcosystemId;
  /** 用于识别该生态的标志文件（任一存在即命中） */
  markers: string[];
  /** 该生态下可安全清理的目录名（项目根直接子目录） */
  cleanableDirs: { name: string; hint: string }[];
}

export const ECOSYSTEMS: EcosystemSpec[] = [
  {
    id: 'node',
    markers: ['package.json'],
    cleanableDirs: [
      { name: 'node_modules', hint: 'npm/pnpm/yarn install 可恢复' },
      { name: '.next', hint: 'Next.js 构建产物，next build 可重建' },
      { name: '.nuxt', hint: 'Nuxt 构建产物，可重建' },
      { name: '.turbo', hint: 'Turborepo 缓存' },
      { name: '.cache', hint: '构建缓存' },
      { name: 'dist', hint: '前端打包输出，可重新构建' },
      { name: 'build', hint: '构建输出，可重新构建' },
      { name: 'out', hint: '构建输出，可重新构建' }
    ]
  },
  {
    id: 'rust',
    markers: ['Cargo.toml'],
    cleanableDirs: [{ name: 'target', hint: 'cargo build 可重建' }]
  },
  {
    id: 'go',
    markers: ['go.mod'],
    cleanableDirs: [
      { name: 'bin', hint: 'go build 可重建' },
      { name: 'vendor', hint: 'go mod vendor 可恢复' }
    ]
  },
  {
    id: 'python',
    markers: ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py'],
    cleanableDirs: [
      { name: '.venv', hint: '虚拟环境，可重建' },
      { name: 'venv', hint: '虚拟环境，可重建' },
      { name: '__pycache__', hint: 'Python 字节码缓存' },
      { name: '.pytest_cache', hint: 'pytest 缓存' },
      { name: '.mypy_cache', hint: 'mypy 缓存' },
      { name: '.ruff_cache', hint: 'ruff 缓存' },
      { name: 'dist', hint: '打包输出，可重建' },
      { name: 'build', hint: '打包输出，可重建' }
    ]
  },
  {
    id: 'java-maven',
    markers: ['pom.xml'],
    cleanableDirs: [{ name: 'target', hint: 'mvn package 可重建' }]
  },
  {
    id: 'java-gradle',
    markers: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
    cleanableDirs: [
      { name: 'build', hint: 'gradle build 可重建' },
      { name: '.gradle', hint: 'Gradle 项目缓存' }
    ]
  },
  {
    id: 'apple-xcode',
    // 使用通配匹配：xxx.xcodeproj、xxx.xcworkspace
    markers: ['*.xcodeproj', '*.xcworkspace'],
    cleanableDirs: [
      { name: 'DerivedData', hint: 'Xcode 自动重建' },
      { name: 'build', hint: '可重建' },
      { name: '.build', hint: 'SwiftPM 构建产物' }
    ]
  },
  {
    id: 'apple-spm',
    markers: ['Package.swift'],
    cleanableDirs: [{ name: '.build', hint: 'SwiftPM 构建产物，swift build 可重建' }]
  },
  {
    id: 'android',
    // 与 Gradle 标记相同；scanner 通过内容嗅探 com.android.* 插件进一步区分。
    // 这里的 markers 仅用于 lastModified 取 mtime；命中判定不依赖 markers 自动匹配。
    markers: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
    cleanableDirs: [
      { name: 'build', hint: 'Android 根项目构建产物，gradle clean 可重建' },
      { name: '.gradle', hint: 'Gradle 项目缓存' },
      { name: '.cxx', hint: 'Android NDK 构建产物，可重建' }
    ]
  }
];

/** Android Gradle 插件正则，用于嗅探 build.gradle / build.gradle.kts 内容 */
export const ANDROID_PLUGIN_RE =
  /com\.android\.(application|library|dynamic-feature|test|asset-pack)/;

/** 不应进入扫描的目录名（性能与安全） */
export const SKIP_DIRS = new Set<string>([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'target',
  'build',
  'dist',
  'out',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  '.gradle',
  'DerivedData',
  '.build',
  'Pods', // CocoaPods
  'vendor'
]);

/**
 * 当扫描入口为用户主目录时，需要跳过的系统/非项目顶层目录。
 * 目标用户多为非程序员，不一定有统一的 Dev 目录，因此默认从 $HOME 扫起，
 * 但要避免把 macOS 系统目录、应用配置等误识别。
 */
export const SYSTEM_SKIP_DIRS = new Set<string>([
  // macOS 系统/用户目录
  'Library',
  'Applications',
  'Movies',
  'Music',
  'Pictures',
  'Public',
  '.Trash',
  '.cups',
  // 跨平台常见的非项目目录
  'Downloads',
  // 云盘同步目录里的项目通常不该被本工具清理
  'Dropbox',
  'OneDrive',
  'Google Drive'
]);
