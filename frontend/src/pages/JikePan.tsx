import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, Card, CardBody, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter,
  ModalHeader, Progress, Select, SelectItem, Spinner, Switch, Tab, Tabs, Textarea,
  useDisclosure,
} from '@heroui/react'
import {
  HiCloud, HiDocument, HiDownload, HiExternalLink, HiFolder, HiFolderAdd, HiKey,
  HiLink, HiRefresh, HiSearch, HiShare, HiTrash, HiUpload, HiX, HiChevronRight,
} from 'react-icons/hi'
import { userApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'

interface PanEntry {
  id: string
  kind: 'file' | 'folder'
  name: string
  sizeBytes?: number
  contentType?: string
  bucketName?: string
  path?: string
  createdAt?: string
  tags?: string[]
  favorite?: boolean
  fileCount?: number
}

interface PanShare {
  id: string
  token: string
  kind: 'direct' | 'bundle'
  name: string
  fileCount: number
  createdAt: string
  maxDownloads: number
  downloadCount: number
  expiresAt: string
  hasPassword: boolean
  description: string
  themePreset: string
  url: string
  directUrl?: string
}

interface PathItem {
  id: string
  name: string
}

interface PanBucket {
  name: string
  displayName?: string
}

interface PanDirectPart {
  index: number
  partNo: number
  url: string
  start: number
  end: number
  total: number
}

interface PanUploadSession {
  id: string
  chunkSize: number
  totalChunks: number
  uploadedChunks?: number[]
  uploadMode: string
  directParts?: PanDirectPart[]
}

const themeOptions = ['zinc', 'sky', 'emerald', 'rose', 'violet', 'indigo', 'orange', 'stone']
const chunkUploadThreshold = 5 * 1024 * 1024

const formatSize = (bytes?: number) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

const formatDate = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const isExpired = (value?: string) => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now()
}

const getStoredConfig = () => {
  return {
    baseUrl: localStorage.getItem('pan_open_base_url') || '',
    apiKey: localStorage.getItem('pan_open_api_key') || '',
  }
}

export default function JikePan() {
  const initialConfig = getStoredConfig()
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl)
  const [apiKey, setApiKey] = useState(initialConfig.apiKey)
  const [connected, setConnected] = useState(Boolean(initialConfig.baseUrl && initialConfig.apiKey))
  const [activeTab, setActiveTab] = useState('files')
  const [entries, setEntries] = useState<PanEntry[]>([])
  const [shares, setShares] = useState<PanShare[]>([])
  const [sharePage, setSharePage] = useState(1)
  const [sharePageSize, setSharePageSize] = useState(20)
  const [shareTotal, setShareTotal] = useState(0)
  const [buckets, setBuckets] = useState<PanBucket[]>([])
  const [uploadBucket, setUploadBucket] = useState('')
  const [folderBucket, setFolderBucket] = useState('')
  const [path, setPath] = useState<PathItem[]>([{ id: '', name: '根目录' }])
  const [keyword, setKeyword] = useState('')
  const [kind, setKind] = useState('all')
  const [fileType, setFileType] = useState('all')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [folderName, setFolderName] = useState('')
  const [shareTarget, setShareTarget] = useState<PanEntry | null>(null)
  const [shareName, setShareName] = useState('')
  const [sharePassword, setSharePassword] = useState('')
  const [shareMaxDownloads, setShareMaxDownloads] = useState('0')
  const [shareExpiresAt, setShareExpiresAt] = useState('')
  const [shareDescription, setShareDescription] = useState('')
  const [shareAutoUpdate, setShareAutoUpdate] = useState(false)
  const [shareTheme, setShareTheme] = useState('zinc')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { isOpen: isFolderOpen, onOpen: onFolderOpen, onClose: onFolderClose } = useDisclosure()
  const { isOpen: isShareOpen, onOpen: onShareOpen, onClose: onShareClose } = useDisclosure()

  const headers = useMemo(() => ({
    'X-Pan-Base-URL': baseUrl.trim(),
    'X-Pan-API-Key': apiKey.trim(),
  }), [apiKey, baseUrl])

  const currentFolder = path[path.length - 1]
  const currentFolderId = currentFolder?.id || ''
  const shareTotalPages = Math.max(1, Math.ceil(shareTotal / sharePageSize))

  const saveConfig = () => {
    if (!baseUrl.trim()) {
      toast.error('请填写 API 根地址')
      return
    }
    if (!apiKey.trim()) {
      toast.error('请填写 API Key')
      return
    }
    localStorage.setItem('pan_open_base_url', baseUrl.trim())
    localStorage.setItem('pan_open_api_key', apiKey.trim())
    setUploadBucket('')
    setPath([{ id: '', name: '根目录' }])
    setConnected(true)
    void loadFiles('', '', '')
  }

  const disconnect = () => {
    localStorage.removeItem('pan_open_base_url')
    localStorage.removeItem('pan_open_api_key')
    setConnected(false)
    setUploadBucket('')
    setBuckets([])
    setEntries([])
    setShares([])
    setSharePage(1)
    setShareTotal(0)
    setPath([{ id: '', name: '根目录' }])
  }

  const loadFiles = useCallback(async (folderId = currentFolderId, nextKeyword = keyword) => {
    if (!baseUrl.trim() || !apiKey.trim()) return
    setLoading(true)
    try {
      const params: any = {
        page: 1,
        pageSize: 100,
        folderId: folderId || undefined,
        q: nextKeyword.trim() || undefined,
        kind: kind === 'all' ? undefined : kind,
        fileType: fileType === 'all' ? undefined : fileType,
        favorite: favoriteOnly ? 'true' : undefined,
      }
      const res: any = await userApi.listPanFiles(params, headers)
      const nextBuckets = res.data?.buckets || []
      setEntries(res.data?.entries || [])
      setBuckets(nextBuckets)
      if (!uploadBucket && !folderId) {
        const nextBucket = res.data?.currentBucket || nextBuckets[0]?.name || ''
        if (nextBucket) setUploadBucket(nextBucket)
      }
    } catch (e: any) {
      toast.error(e.message || '获取文件列表失败')
    } finally {
      setLoading(false)
    }
  }, [apiKey, baseUrl, currentFolderId, favoriteOnly, fileType, headers, keyword, kind, uploadBucket])

  const loadShares = useCallback(async (page = sharePage, pageSize = sharePageSize) => {
    if (!baseUrl.trim() || !apiKey.trim()) return
    setLoading(true)
    try {
      const res: any = await userApi.listPanShares({ page, pageSize }, headers)
      const items = res.data?.items || []
      const total = Number(res.data?.total ?? items.length)
      setShares(items)
      setSharePage(Number(res.data?.page || page))
      setSharePageSize(Number(res.data?.pageSize || pageSize))
      setShareTotal(total)
    } catch (e: any) {
      toast.error(e.message || '获取分享列表失败')
    } finally {
      setLoading(false)
    }
  }, [apiKey, baseUrl, headers, sharePage, sharePageSize])

  useEffect(() => {
    if (!connected) return
    void loadFiles()
  }, [connected, kind, fileType, favoriteOnly])

  useEffect(() => {
    if (connected && activeTab === 'shares') void loadShares(sharePage, sharePageSize)
  }, [activeTab, connected, loadShares, sharePage, sharePageSize])

  const enterFolder = (entry: PanEntry) => {
    if (entry.kind !== 'folder') return
    setPath((prev) => [...prev, { id: entry.id, name: entry.name }])
    setKeyword('')
    void loadFiles(entry.id, '')
  }

  const navigateTo = (index: number) => {
    const nextPath = path.slice(0, index + 1)
    const target = nextPath[nextPath.length - 1]
    setPath(nextPath)
    setKeyword('')
    void loadFiles(target.id, '')
  }

  const changeBucket = (value: string) => {
    setUploadBucket(value)
  }

  const changeFolderBucket = (value: string) => {
    setFolderBucket(value === '__inherit__' ? '' : value)
  }

  const openFolderModal = () => {
    setFolderBucket('')
    onFolderOpen()
  }

  const createFolder = async () => {
    const name = folderName.trim()
    if (!name) {
      toast.error('请填写目录名称')
      return
    }
    try {
      await userApi.createPanFolder({
        name,
        bucketName: currentFolderId || !folderBucket ? undefined : folderBucket,
        parentId: currentFolderId || undefined,
        inherit: !folderBucket,
      }, headers)
      toast.success('创建成功')
      setFolderName('')
      setFolderBucket('')
      onFolderClose()
      void loadFiles()
    } catch (e: any) {
      toast.error(e.message || '创建失败')
    }
  }

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadProgress(0)
    let uploadId = ''
    try {
      if (file.size <= chunkUploadThreshold) {
        setUploadStatus('上传文件')
        const formData = new FormData()
        formData.append('file', file)
        if (!currentFolderId && uploadBucket) formData.append('bucketName', uploadBucket)
        if (currentFolderId) formData.append('folderId', currentFolderId)
        await userApi.uploadPanFile(formData, headers, ({ percent }) => setUploadProgress(percent))
        toast.success('上传成功')
        void loadFiles()
        return
      }

      setUploadStatus('创建上传会话')
      const sessionRes: any = await userApi.createPanUploadSession({
        name: file.name,
        sizeBytes: file.size,
        contentType: file.type || 'application/octet-stream',
        bucketName: currentFolderId ? undefined : uploadBucket || undefined,
        folderId: currentFolderId || undefined,
      }, headers)
      const session = sessionRes.data as PanUploadSession
      uploadId = session.id
      const chunkSize = session.chunkSize || file.size
      const totalChunks = session.totalChunks || Math.max(1, Math.ceil(file.size / chunkSize))
      const uploaded = new Set(session.uploadedChunks || [])
      const parts: Array<{ index: number; partNo: number; etag: string }> = []

      for (let index = 0; index < totalChunks; index += 1) {
        if (uploaded.has(index)) {
          setUploadProgress(Math.round(((index + 1) / totalChunks) * 100))
          continue
        }
        const start = index * chunkSize
        const end = Math.min(file.size, start + chunkSize)
        const chunk = file.slice(start, end)
        setUploadStatus(`上传分片 ${index + 1}/${totalChunks}`)

        if (session.uploadMode === 'direct-object' || session.uploadMode === 'direct-onedrive') {
          let directPart = session.directParts?.find((part) => part.index === index)
          if (!directPart) {
            const freshRes: any = await userApi.getPanUploadSession(uploadId, headers)
            const fresh = freshRes.data as PanUploadSession
            directPart = fresh.directParts?.find((part) => part.index === index)
          }
          if (!directPart?.url) throw new Error(`分片 ${index + 1} 缺少直传地址`)
          const directHeaders: Record<string, string> = {}
          if (session.uploadMode === 'direct-onedrive') {
            directHeaders['Content-Range'] = `bytes ${directPart.start}-${directPart.end}/${directPart.total}`
          }
          const res = await fetch(directPart.url, {
            method: 'PUT',
            headers: directHeaders,
            body: chunk,
          })
          if (!res.ok) throw new Error(`分片 ${index + 1} 上传失败: HTTP ${res.status}`)
          if (session.uploadMode === 'direct-object') {
            const etag = res.headers.get('ETag') || res.headers.get('etag')
            if (!etag) throw new Error(`分片 ${index + 1} 未返回 ETag`)
            parts.push({ index, partNo: directPart.partNo || index + 1, etag })
          }
          setUploadProgress(Math.round(((index + 1) / totalChunks) * 100))
        } else {
          const chunkForm = new FormData()
          chunkForm.append('chunk', chunk, `${file.name}.part-${index}`)
          await userApi.uploadPanChunk(uploadId, index, chunkForm, headers, ({ loaded, total }) => {
            const chunkRatio = total ? loaded / total : 0
            const percent = Math.round(((index + chunkRatio) / totalChunks) * 100)
            setUploadProgress(Math.min(99, percent))
          })
          setUploadProgress(Math.round(((index + 1) / totalChunks) * 100))
        }
      }

      setUploadStatus('完成上传')
      await userApi.completePanUpload(uploadId, parts.length ? { parts } : {}, headers)
      toast.success('上传成功')
      void loadFiles()
    } catch (err: any) {
      if (uploadId) {
        try {
          await userApi.cancelPanUpload(uploadId, headers)
        } catch {
          // ignore cleanup failures
        }
      }
      toast.error(err.message || '上传失败')
    } finally {
      setUploading(false)
      setUploadProgress(0)
      setUploadStatus('')
      e.target.value = ''
    }
  }

  const deleteEntry = async (entry: PanEntry) => {
    if (!await confirm(`确定要删除 ${entry.name} 吗？`)) return
    try {
      if (entry.kind === 'folder') {
        await userApi.deletePanFolder(entry.id, headers)
      } else {
        await userApi.deletePanFile(entry.id, headers)
      }
      toast.success('删除成功')
      void loadFiles()
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  const copyDirectLink = async (entry: PanEntry) => {
    try {
      const res: any = await userApi.getPanDirectLink(entry.id, headers)
      const link = res.data?.url || res.data?.directUrl
      if (!link) throw new Error('接口未返回直连地址')
      await navigator.clipboard.writeText(link)
      toast.success('直连已复制')
    } catch (e: any) {
      toast.error(e.message || '获取直连失败')
    }
  }

  const downloadEntry = (entry: PanEntry) => {
    const params = new URLSearchParams({
      pan_base_url: baseUrl.trim(),
      pan_api_key: apiKey.trim(),
    })
    window.open(`/api/user/pan/files/${encodeURIComponent(entry.id)}/content?${params.toString()}`, '_blank')
  }

  const openShareModal = (entry: PanEntry) => {
    setShareTarget(entry)
    setShareName(entry.name)
    setSharePassword('')
    setShareMaxDownloads('0')
    setShareExpiresAt('')
    setShareDescription('')
    setShareAutoUpdate(entry.kind === 'folder')
    setShareTheme('zinc')
    onShareOpen()
  }

  const createShare = async () => {
    if (!shareTarget) return
    const payload = {
      name: shareName.trim() || undefined,
      password: sharePassword,
      maxDownloads: Number(shareMaxDownloads || 0),
      expiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : '',
      description: shareDescription,
      autoUpdate: shareAutoUpdate,
      themePreset: shareTheme,
    }
    try {
      const res: any = shareTarget.kind === 'file'
        ? await userApi.createPanFileShare(shareTarget.id, payload, headers)
        : await userApi.createPanShare({ fileIds: [shareTarget.id], ...payload }, headers)
      const link = res.data?.directUrl || res.data?.url
      if (link) await navigator.clipboard.writeText(link)
      toast.success(link ? '分享已创建并复制链接' : '分享已创建')
      onShareClose()
      if (activeTab === 'shares') void loadShares(sharePage, sharePageSize)
    } catch (e: any) {
      toast.error(e.message || '创建分享失败')
    }
  }

  const deleteShare = async (share: PanShare) => {
    if (!await confirm(`确定要删除分享 ${share.name || share.token} 吗？`)) return
    try {
      await userApi.deletePanShare(share.token, headers)
      toast.success('分享已删除')
      const nextPage = shares.length === 1 && sharePage > 1 ? sharePage - 1 : sharePage
      setSharePage(nextPage)
      void loadShares(nextPage, sharePageSize)
    } catch (e: any) {
      toast.error(e.message || '删除分享失败')
    }
  }

  const copyShareLink = async (share: PanShare) => {
    await navigator.clipboard.writeText(share.directUrl || share.url)
    toast.success('已复制')
  }

  const changeSharePageSize = (value: string) => {
    const nextPageSize = Number(value)
    setSharePageSize(nextPageSize)
    setSharePage(1)
    void loadShares(1, nextPageSize)
  }

  if (!connected) {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <HiCloud className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">连接网盘</h2>
                <p className="text-sm text-default-500">使用目标网盘地址和 API Key 接入</p>
              </div>
            </div>
            <Input label="网盘地址" placeholder="https://pan.example.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            <Input label="API Key" placeholder="jkp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={apiKey} onChange={(e) => setApiKey(e.target.value)} startContent={<HiKey className="w-4 h-4 text-default-400" />} />
            <Button color="primary" onPress={saveConfig}>连接</Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HiCloud className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-semibold">网盘</h1>
              <Chip size="sm" variant="flat" color="primary">Open API</Chip>
            </div>
            <p className="mt-1 text-sm text-default-500 truncate">{baseUrl}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="flat" startContent={<HiRefresh className="w-4 h-4" />} onPress={() => activeTab === 'shares' ? loadShares(sharePage, sharePageSize) : loadFiles()}>
              刷新
            </Button>
            <Button variant="bordered" onPress={disconnect}>断开</Button>
          </div>
        </CardBody>
      </Card>

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(String(key))}
        classNames={{ base: 'gap-0', panel: '!mt-0 !pt-2 !px-0 !pb-0' }}
      >
        <Tab key="files" title="文件">
          <div className="space-y-3">
            <Card>
              <CardBody className="space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row">
                  <Input
                    placeholder="搜索文件或目录"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadFiles(currentFolderId, keyword)}
                    startContent={<HiSearch className="w-4 h-4 text-default-400" />}
                    endContent={keyword ? (
                      <Button isIconOnly size="sm" variant="light" onPress={() => { setKeyword(''); void loadFiles(currentFolderId, '') }}>
                        <HiX className="w-4 h-4" />
                      </Button>
                    ) : null}
                  />
                  <Select className="lg:max-w-44" selectedKeys={[kind]} onChange={(e) => setKind(e.target.value)}>
                    <SelectItem key="all">全部类型</SelectItem>
                    <SelectItem key="file">文件</SelectItem>
                    <SelectItem key="folder">目录</SelectItem>
                  </Select>
                  <Select className="lg:max-w-44" selectedKeys={[fileType]} onChange={(e) => setFileType(e.target.value)}>
                    <SelectItem key="all">全部文件</SelectItem>
                    <SelectItem key="image">图片</SelectItem>
                    <SelectItem key="video">视频</SelectItem>
                    <SelectItem key="audio">音频</SelectItem>
                    <SelectItem key="document">文档</SelectItem>
                    <SelectItem key="archive">压缩包</SelectItem>
                  </Select>
                  <Button color="primary" variant="flat" onPress={() => loadFiles(currentFolderId, keyword)}>搜索</Button>
                </div>
                <div className={`grid gap-3 ${currentFolderId ? 'lg:grid-cols-[minmax(0,1fr)_auto]' : 'lg:grid-cols-[220px_minmax(0,1fr)_auto]'} lg:items-center`}>
                  {!currentFolderId && (
                    <Select
                      label="上传存储桶"
                      size="sm"
                      selectedKeys={uploadBucket ? [uploadBucket] : []}
                      onChange={(e) => changeBucket(e.target.value)}
                    >
                      {buckets.map((bucket) => (
                        <SelectItem key={bucket.name}>{bucket.displayName || bucket.name}</SelectItem>
                      ))}
                    </Select>
                  )}
                  <nav
                    aria-label="当前目录"
                    className="flex min-w-0 items-center overflow-x-auto rounded-md border border-default-200 bg-default-50 px-2 py-1.5"
                  >
                    {path.map((item, index) => (
                      <div key={`${item.id}-${index}`} className="flex min-w-0 shrink-0 items-center">
                        {index > 0 && <HiChevronRight className="mx-1 h-4 w-4 shrink-0 text-default-300" />}
                        <button
                          type="button"
                          aria-current={index === path.length - 1 ? 'page' : undefined}
                          disabled={index === path.length - 1}
                          onClick={() => navigateTo(index)}
                          className={`max-w-[10rem] truncate rounded px-2 py-1 text-sm transition-colors ${
                            index === path.length - 1
                              ? 'cursor-default font-medium text-foreground'
                              : 'cursor-pointer text-default-500 hover:bg-default-100 hover:text-foreground'
                          }`}
                          title={item.name}
                        >
                          {item.name}
                        </button>
                      </div>
                    ))}
                  </nav>
                  <Switch size="sm" isSelected={favoriteOnly} onValueChange={setFavoriteOnly}>只看收藏</Switch>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button startContent={<HiFolderAdd className="w-4 h-4" />} variant="flat" onPress={openFolderModal}>新建目录</Button>
                    <Button startContent={<HiUpload className="w-4 h-4" />} color="primary" onPress={() => fileInputRef.current?.click()} isLoading={uploading}>上传文件</Button>
                  </div>
                  {uploading && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3 text-sm text-default-500">
                        <span>{uploadStatus || '上传中'}</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <Progress
                        aria-label="上传进度"
                        className="max-w-md"
                        color="primary"
                        size="sm"
                        value={uploadProgress}
                      />
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-0">
                {loading ? (
                  <div className="flex justify-center py-12"><Spinner size="lg" /></div>
                ) : entries.length === 0 ? (
                  <div className="py-12 text-center text-default-500">暂无文件</div>
                ) : (
                  <div className="divide-y divide-default-100">
                    <div className="hidden md:grid grid-cols-[1fr_120px_150px_180px] gap-3 px-4 py-2 text-xs font-medium text-default-500 bg-default-50">
                      <span>名称</span>
                      <span className="text-right">大小</span>
                      <span>存储桶</span>
                      <span className="text-right">操作</span>
                    </div>
                    {entries.map((entry) => (
                      <div key={`${entry.kind}-${entry.id}`} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_120px_150px_180px] gap-3 px-4 py-3 items-center hover:bg-default-50">
                        <button className="flex items-center gap-2 min-w-0 text-left" onClick={() => enterFolder(entry)}>
                          {entry.kind === 'folder' ? <HiFolder className="w-5 h-5 text-warning shrink-0" /> : <HiDocument className="w-5 h-5 text-default-400 shrink-0" />}
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{entry.name}</span>
                            {entry.path && <span className="block truncate text-xs text-default-400">{entry.path}</span>}
                          </span>
                        </button>
                        <div className="hidden md:block text-right text-sm text-default-500">{entry.kind === 'file' ? formatSize(entry.sizeBytes) : `${entry.fileCount || 0} 项`}</div>
                        <div className="hidden md:block text-sm text-default-500 truncate">{entry.bucketName || '-'}</div>
                        <div className="flex justify-end gap-1">
                          {entry.kind === 'file' && (
                            <>
                              <Button isIconOnly size="sm" variant="light" onPress={() => copyDirectLink(entry)}><HiLink className="w-4 h-4" /></Button>
                              <Button isIconOnly size="sm" variant="light" onPress={() => downloadEntry(entry)}><HiDownload className="w-4 h-4" /></Button>
                            </>
                          )}
                          <Button isIconOnly size="sm" variant="light" onPress={() => openShareModal(entry)}><HiShare className="w-4 h-4" /></Button>
                          <Button isIconOnly size="sm" variant="light" color="danger" onPress={() => deleteEntry(entry)}><HiTrash className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </Tab>

        <Tab key="shares" title="分享">
          <div className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-default-500">
                共 {shareTotal} 条分享
              </div>
              <Select
                size="sm"
                className="w-full md:w-36"
                selectedKeys={[String(sharePageSize)]}
                onChange={(e) => changeSharePageSize(e.target.value)}
                aria-label="每页数量"
              >
                <SelectItem key="20">20 条/页</SelectItem>
                <SelectItem key="50">50 条/页</SelectItem>
                <SelectItem key="100">100 条/页</SelectItem>
              </Select>
            </div>

            <Card>
              <CardBody className="p-0">
                {loading ? (
                  <div className="flex justify-center py-12"><Spinner size="lg" /></div>
                ) : shares.length === 0 ? (
                  <div className="py-12 text-center text-default-500">暂无分享</div>
                ) : (
                  <div className="divide-y divide-default-100">
                    <div className="hidden lg:grid grid-cols-[minmax(0,1.4fr)_96px_120px_130px_130px_160px] gap-4 px-4 py-2 text-xs font-medium text-default-500 bg-default-50">
                      <span>分享信息</span>
                      <span>类型</span>
                      <span>文件</span>
                      <span>下载</span>
                      <span>有效期</span>
                      <span className="text-right">操作</span>
                    </div>
                    {shares.map((share) => (
                      <div key={share.token} className="grid gap-3 px-4 py-3 hover:bg-default-50 lg:grid-cols-[minmax(0,1.4fr)_96px_120px_130px_130px_160px] lg:items-center lg:gap-4">
                        <div className="min-w-0 space-y-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="min-w-0 truncate text-sm font-medium">{share.name || share.token}</span>
                            {share.hasPassword && <Chip size="sm" color="warning" variant="flat">有密码</Chip>}
                            {share.expiresAt && isExpired(share.expiresAt) && <Chip size="sm" color="danger" variant="flat">已过期</Chip>}
                          </div>
                          <p className="truncate font-mono text-xs text-default-500">{share.directUrl || share.url}</p>
                          {share.description && <p className="truncate text-xs text-default-400">{share.description}</p>}
                        </div>

                        <div className="flex items-center gap-2 lg:block">
                          <span className="text-xs text-default-400 lg:hidden">类型</span>
                          <Chip size="sm" variant="flat" color={share.kind === 'direct' ? 'success' : 'primary'}>
                            {share.kind === 'direct' ? '直连' : '分享'}
                          </Chip>
                        </div>

                        <div className="flex items-center justify-between text-sm lg:block">
                          <span className="text-xs text-default-400 lg:hidden">文件</span>
                          <span>{share.fileCount || 0} 个</span>
                        </div>

                        <div className="flex items-center justify-between text-sm lg:block">
                          <span className="text-xs text-default-400 lg:hidden">下载</span>
                          <span>{share.downloadCount || 0} / {share.maxDownloads ? share.maxDownloads : '不限'}</span>
                        </div>

                        <div className="flex items-center justify-between text-sm lg:block">
                          <span className="text-xs text-default-400 lg:hidden">有效期</span>
                          <span className={share.expiresAt && isExpired(share.expiresAt) ? 'text-danger' : 'text-default-600'}>
                            {share.expiresAt ? formatDate(share.expiresAt) : '永不过期'}
                          </span>
                          <span className="hidden text-xs text-default-400 lg:block">{formatDate(share.createdAt)}</span>
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button size="sm" isIconOnly variant="flat" aria-label="打开分享" onPress={() => window.open(share.directUrl || share.url, '_blank')}>
                            <HiExternalLink className="w-4 h-4" />
                          </Button>
                          <Button size="sm" isIconOnly variant="flat" aria-label="复制分享链接" onPress={() => copyShareLink(share)}>
                            <HiLink className="w-4 h-4" />
                          </Button>
                          <Button size="sm" isIconOnly color="danger" variant="light" aria-label="删除分享" onPress={() => deleteShare(share)}>
                            <HiTrash className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            {shareTotalPages > 1 && (
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-default-500">
                  第 {sharePage} / {shareTotalPages} 页
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="flat" isDisabled={sharePage <= 1} onPress={() => setSharePage((page) => Math.max(1, page - 1))}>
                    上一页
                  </Button>
                  <Button size="sm" variant="flat" isDisabled={sharePage >= shareTotalPages} onPress={() => setSharePage((page) => Math.min(shareTotalPages, page + 1))}>
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Tab>
      </Tabs>

      <Modal isOpen={isFolderOpen} onClose={onFolderClose}>
        <ModalContent>
          <ModalHeader>新建目录</ModalHeader>
          <ModalBody>
            <Input label="目录名称" value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createFolder()} />
            <Select
              label="存储桶"
              selectedKeys={[folderBucket || '__inherit__']}
              onChange={(e) => changeFolderBucket(e.target.value)}
            >
              <SelectItem key="__inherit__">继承当前目录</SelectItem>
              {buckets.map((bucket) => (
                <SelectItem key={bucket.name}>{bucket.displayName || bucket.name}</SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onFolderClose}>取消</Button>
            <Button color="primary" onPress={createFolder}>创建</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isShareOpen} onClose={onShareClose} size="2xl">
        <ModalContent>
          <ModalHeader>创建分享</ModalHeader>
          <ModalBody className="space-y-3">
            <Input label="分享名称" value={shareName} onChange={(e) => setShareName(e.target.value)} />
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="分享密码" value={sharePassword} onChange={(e) => setSharePassword(e.target.value)} />
              <Input label="下载次数限制" type="number" min="0" value={shareMaxDownloads} onChange={(e) => setShareMaxDownloads(e.target.value)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="过期时间" type="datetime-local" value={shareExpiresAt} onChange={(e) => setShareExpiresAt(e.target.value)} />
              <Select label="分享页面配色" selectedKeys={[shareTheme]} onChange={(e) => setShareTheme(e.target.value)}>
                {themeOptions.map((item) => <SelectItem key={item}>{item}</SelectItem>)}
              </Select>
            </div>
            {shareTarget?.kind === 'folder' && (
              <Switch isSelected={shareAutoUpdate} onValueChange={setShareAutoUpdate}>分享目录自动更新</Switch>
            )}
            <Textarea label="分享说明" value={shareDescription} onChange={(e) => setShareDescription(e.target.value)} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onShareClose}>取消</Button>
            <Button color="primary" onPress={createShare}>创建并复制链接</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <input ref={fileInputRef} type="file" className="hidden" onChange={uploadFile} />
    </div>
  )
}
