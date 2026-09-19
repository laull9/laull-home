import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { isAbsolute, normalize, resolve, sep } from 'node:path'

// 单个 Zip 解压条目结构。
export interface ZipEntry {
  path: string
  data: Buffer
  isDirectory: boolean
  compressedSize: number
  uncompressedSize: number
}

// Zip 安全限制项。
export interface ZipSecurityOptions {
  // 单个文件最大解压体积（字节），默认 5MB。
  maxFileSize?: number
  // 全部文件解压累计最大体积（字节），默认 25MB。
  maxTotalSize?: number
  // 压缩包内最多包含的文件数量，默认 50。
  maxFiles?: number
}

// Zip 处理业务异常。
export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipError'
  }
}

// CRC32 计算查表缓存。
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  }
  CRC_TABLE[n] = c >>> 0
}

// 计算 Buffer 的 CRC32 校验和。
export function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

// 检查并净化 Zip 相对路径，严密阻断 Zip Slip 跨目录逃逸漏洞。
export function sanitizeZipEntryPath(rawPath: string, targetBaseDir?: string): string {
  // 替换反斜杠为标准正斜杠，去除不可见与控制字符。
  // eslint-disable-next-line no-control-regex
  const normalizedPath = rawPath.replace(/\\/g, '/').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()

  if (!normalizedPath || normalizedPath === '.' || normalizedPath === '/') {
    throw new ZipError('压缩包内文件名无效')
  }

  // 严禁绝对路径。
  if (isAbsolute(normalizedPath) || normalizedPath.startsWith('/')) {
    throw new ZipError(`检测到非法绝对路径条目：${rawPath}`)
  }

  // 严禁任何路径分段中出现 .. 逃逸序列。
  const segments = normalizedPath.split('/')
  if (segments.some(seg => seg === '..')) {
    throw new ZipError(`检测到 Zip Slip 目录穿越攻击尝试：${rawPath}`)
  }

  // 若指定了目标基准目录，双重校验解析后的完整路径严格位于基准目录之内。
  if (targetBaseDir) {
    const base = resolve(targetBaseDir)
    const full = resolve(base, normalize(normalizedPath))
    if (!full.startsWith(base + sep) && full !== base) {
      throw new ZipError(`条目解压路径超出目标根目录：${rawPath}`)
    }
  }

  return segments.filter(Boolean).join('/')
}

// 从 Buffer 安全解压 Zip 文件，全面防御 Zip Slip 与 Zip 炸弹。
export function readZipEntries(buffer: Buffer, options: ZipSecurityOptions = {}): ZipEntry[] {
  const maxFileSize = options.maxFileSize ?? 5 * 1024 * 1024
  const maxTotalSize = options.maxTotalSize ?? 25 * 1024 * 1024
  const maxFiles = options.maxFiles ?? 50

  const entries: ZipEntry[] = []
  let offset = 0
  let totalExtractedSize = 0

  while (offset < buffer.length - 4) {
    const signature = buffer.readUInt32LE(offset)

    // Local File Header 签名：0x04034b50。
    if (signature === 0x04034b50) {
      if (offset + 30 > buffer.length) {
        throw new ZipError('Zip 头部截断损坏')
      }

      const compressionMethod = buffer.readUInt16LE(offset + 8)
      const compressedSize = buffer.readUInt32LE(offset + 18)
      const uncompressedSize = buffer.readUInt32LE(offset + 22)
      const fileNameLength = buffer.readUInt16LE(offset + 26)
      const extraFieldLength = buffer.readUInt16LE(offset + 28)

      const headerEnd = offset + 30
      if (headerEnd + fileNameLength + extraFieldLength > buffer.length) {
        throw new ZipError('Zip 条目元数据不完整')
      }

      const rawFileName = buffer.toString('utf8', headerEnd, headerEnd + fileNameLength)
      const dataOffset = headerEnd + fileNameLength + extraFieldLength

      // 检测是否为目录条目。
      const isDirectory = rawFileName.endsWith('/')

      // 安全清洗校验文件名，拦截 Zip Slip。
      const safePath = sanitizeZipEntryPath(rawFileName)

      if (isDirectory) {
        entries.push({
          path: safePath,
          data: Buffer.alloc(0),
          isDirectory: true,
          compressedSize: 0,
          uncompressedSize: 0,
        })
        offset = dataOffset
        continue
      }

      if (entries.length >= maxFiles) {
        throw new ZipError(`压缩包内文件数量超出上限（最多允许 ${maxFiles} 个文件）`)
      }

      // 初步体积防护：声明的未压缩大小超限检查。
      if (uncompressedSize > maxFileSize) {
        throw new ZipError(`单个文件体积超出上限（最大允许 ${Math.round(maxFileSize / 1024 / 1024)}MB）`)
      }

      if (dataOffset + compressedSize > buffer.length) {
        throw new ZipError(`Zip 数据区超出文件边界：${safePath}`)
      }

      const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize)
      let extractedData: Buffer

      if (compressionMethod === 0) {
        // Stored (未压缩)。
        extractedData = Buffer.from(compressedData)
      } else if (compressionMethod === 8) {
        // Deflated 压缩。
        try {
          extractedData = inflateRawSync(compressedData, { maxOutputLength: maxFileSize })
        } catch {
          throw new ZipError(`解压文件 ${safePath} 失败，可能存在数据损坏或超出体积限制`)
        }
      } else {
        throw new ZipError(`不支持的 Zip 压缩算法（代码 ${compressionMethod}）`)
      }

      // 二次真实体积核验。
      if (extractedData.length > maxFileSize) {
        throw new ZipError(`文件 ${safePath} 解压后实际体积超出上限`)
      }

      totalExtractedSize += extractedData.length
      if (totalExtractedSize > maxTotalSize) {
        throw new ZipError(`解压累计总体积超出上限（最大允许 ${Math.round(maxTotalSize / 1024 / 1024)}MB），可能存在 Zip 炸弹`)
      }

      entries.push({
        path: safePath,
        data: extractedData,
        isDirectory: false,
        compressedSize,
        uncompressedSize: extractedData.length,
      })

      offset = dataOffset + compressedSize
      continue
    }

    // 遇到 Central Directory (0x02014b50) 或 End of Central Directory (0x06054b50) 说明 Local 条目已读完。
    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break
    }

    offset++
  }

  if (entries.length === 0) {
    throw new ZipError('压缩包内未包含有效文件')
  }

  return entries
}

// 待写入 Zip 的文件条目结构。
export interface ZipFileToWrite {
  path: string
  data: Buffer
}

// 组装生成标准的 Zip 归档 Buffer。
export function createZip(files: ZipFileToWrite[]): Buffer {
  const localHeaders: Buffer[] = []
  const centralHeaders: Buffer[] = []
  let currentOffset = 0

  for (const file of files) {
    const rawPath = file.path.replace(/\\/g, '/').replace(/^\/+/, '')
    const pathBuf = Buffer.from(rawPath, 'utf8')
    const uncompressedData = file.data
    const uncompressedSize = uncompressedData.length
    const fileCrc = crc32(uncompressedData)

    // 使用 deflateRawSync 压缩。
    const deflated = deflateRawSync(uncompressedData)
    // 若压缩后未变小，则使用 Stored 模式存储。
    const useDeflate = deflated.length < uncompressedSize
    const compressedData = useDeflate ? deflated : uncompressedData
    const compressionMethod = useDeflate ? 8 : 0
    const compressedSize = compressedData.length

    // 构造 Local File Header (30 字节 + 路径长)。
    const localHeader = Buffer.alloc(30 + pathBuf.length)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4) // version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6) // general purpose bit flag
    localHeader.writeUInt16LE(compressionMethod, 8)
    localHeader.writeUInt16LE(0, 10) // last mod file time
    localHeader.writeUInt16LE(0, 12) // last mod file date
    localHeader.writeUInt32LE(fileCrc, 14)
    localHeader.writeUInt32LE(compressedSize, 18)
    localHeader.writeUInt32LE(uncompressedSize, 22)
    localHeader.writeUInt16LE(pathBuf.length, 26)
    localHeader.writeUInt16LE(0, 28) // extra field length
    pathBuf.copy(localHeader, 30)

    localHeaders.push(localHeader)
    localHeaders.push(compressedData)

    // 构造 Central Directory Header (46 字节 + 路径长)。
    const centralHeader = Buffer.alloc(46 + pathBuf.length)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed
    centralHeader.writeUInt16LE(0, 8) // general purpose bit flag
    centralHeader.writeUInt16LE(compressionMethod, 10)
    centralHeader.writeUInt16LE(0, 12) // mod time
    centralHeader.writeUInt16LE(0, 14) // mod date
    centralHeader.writeUInt32LE(fileCrc, 16)
    centralHeader.writeUInt32LE(compressedSize, 20)
    centralHeader.writeUInt32LE(uncompressedSize, 24)
    centralHeader.writeUInt16LE(pathBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra field length
    centralHeader.writeUInt16LE(0, 32) // file comment length
    centralHeader.writeUInt16LE(0, 34) // disk number start
    centralHeader.writeUInt16LE(0, 36) // internal file attributes
    centralHeader.writeUInt32LE(0, 38) // external file attributes
    centralHeader.writeUInt32LE(currentOffset, 42) // relative offset of local header
    pathBuf.copy(centralHeader, 46)

    centralHeaders.push(centralHeader)
    currentOffset += localHeader.length + compressedData.length
  }

  const centralDirOffset = currentOffset
  const centralDirBuffer = Buffer.concat(centralHeaders)
  const centralDirSize = centralDirBuffer.length

  // 构造 End of Central Directory Record (22 字节)。
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // number of this disk
  eocd.writeUInt16LE(0, 6) // disk with central directory
  eocd.writeUInt16LE(files.length, 8) // total entries on this disk
  eocd.writeUInt16LE(files.length, 10) // total entries in central directory
  eocd.writeUInt32LE(centralDirSize, 12)
  eocd.writeUInt32LE(centralDirOffset, 16)
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd])
}
