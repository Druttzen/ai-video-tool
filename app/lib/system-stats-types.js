/**
 * @typedef {object} GpuInfo
 * @property {string} name
 * @property {number|null} vramGb
 * @property {boolean} discrete
 * @property {string} [driverVersion]
 */

/**
 * @typedef {object} SystemStats
 * @property {string} source — 'electron' | 'browser'
 * @property {string} platform
 * @property {string} scannedAt
 * @property {number} cpuCores
 * @property {string} [cpuModel]
 * @property {number|null} totalMemGb
 * @property {number|null} freeMemGb
 * @property {number|null} [deviceMemoryGb]
 * @property {GpuInfo[]} gpus
 * @property {GpuInfo|null} primaryGpu
 * @property {string[]} [detectedApis]
 * @property {string[]} [detectedComputeBackends]
 * @property {string} [osRelease]
 * @property {string} [arch]
 */

export {};
