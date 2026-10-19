import { useState, useEffect, useRef } from 'react'
import {
  Card, CardBody, CardHeader, Button, Spinner,
} from '@heroui/react'
import { adminApi } from '../api'
import { toast } from '../components/Toast'
import { confirm } from '../components/ConfirmModal'
import { HiDownload, HiUpload, HiDatabase, HiRefresh } from 'react-icons/hi'

interface BackupStats {
  users: number
  apps: number
  app_users: number
  card_types: number
  cards: number
  orders: number
  versions: number
  agents: number
  data_pools: number
  licenses: number
  blacklists: number
  activities: number
  tables: number
}

export default function Backup() {
  const [stats, setStats] = useState<BackupStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const statsRes = await adminApi.getBackupStats()
      setStats((statsRes as any).data)
    } catch (e: any) {
      toast.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    const url = adminApi.exportBackup()
    const token = localStorage.getItem('token')

    try {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const contentType = res.headers.get('content-type') || ''
      if (!res.ok || contentType.includes('application/json')) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.message || '导出失败')
      }

      const blob = await res.blob()
      if (blob.size === 0) {
        throw new Error('导出文件为空')
      }

      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `system_backup_${new Date().toISOString().slice(0,10)}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
      toast.success('导出成功')
    } catch (e: any) {
      toast.error(e.message || '导出失败')
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.zip') && !file.name.endsWith('.json')) {
      toast.error('请选择ZIP或JSON格式的备份文件')
      return
    }

    if (!await confirm('导入整站备份会清空当前系统数据并恢复备份内容，确定要继续吗？')) {
      e.target.value = ''
      return
    }

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res: any = await adminApi.importBackup(formData)
      toast.success(`导入成功: ${res.data.tables}张表, ${res.data.records}条记录`)
      loadData()
    } catch (e: any) {
      toast.error(e.message || '导入失败')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">数据备份</h1>
        <Button size="sm" variant="flat" startContent={<HiRefresh className="w-4 h-4" />} onPress={loadData}>
          刷新
        </Button>
      </div>

      {/* 数据统计 */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <HiDatabase className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">数据统计</h3>
          </div>
        </CardHeader>
        <CardBody>
          {stats ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-primary">{stats.users}</div>
                <div className="text-sm text-gray-500">平台用户</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-primary">{stats.apps}</div>
                <div className="text-sm text-gray-500">应用</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-success">{stats.app_users}</div>
                <div className="text-sm text-gray-500">用户</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-warning">{stats.card_types}</div>
                <div className="text-sm text-gray-500">卡种</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-secondary">{stats.cards}</div>
                <div className="text-sm text-gray-500">卡号</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-danger">{stats.versions}</div>
                <div className="text-sm text-gray-500">版本</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-danger">{stats.orders}</div>
                <div className="text-sm text-gray-500">订单</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-primary">{stats.agents}</div>
                <div className="text-sm text-gray-500">代理</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-success">{stats.data_pools}</div>
                <div className="text-sm text-gray-500">数据池</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-warning">{stats.licenses}</div>
                <div className="text-sm text-gray-500">证书</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-secondary">{stats.blacklists}</div>
                <div className="text-sm text-gray-500">黑名单</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-danger">{stats.activities}</div>
                <div className="text-sm text-gray-500">活动</div>
              </div>
              <div className="text-center p-3 bg-default-100 rounded-lg">
                <div className="text-2xl font-bold text-primary">{stats.tables}</div>
                <div className="text-sm text-gray-500">数据表</div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-4">暂无数据</div>
          )}
        </CardBody>
      </Card>

      {/* 导出备份 */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <HiDownload className="w-5 h-5 text-success" />
            <h3 className="font-semibold">导出备份</h3>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-gray-500">
            导出整站数据为ZIP压缩包，包含平台用户、系统配置、应用、软件用户、卡号、代理、订单、日志等全部业务数据，支持 MySQL、PostgreSQL、MariaDB 间迁移导入。
          </p>
          <div className="flex gap-4 items-center flex-wrap">
            <Button
              color="success"
              size="sm"
              className="text-white"
              startContent={<HiDownload className="w-4 h-4" />}
              onPress={handleExport}
            >
              导出备份
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* 导入备份 */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <HiUpload className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">导入备份</h3>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-gray-500">
            从整站备份文件恢复数据。导入会先清空当前系统数据，再按当前数据库类型恢复全部表、原始ID和关联关系。
          </p>
          <div className="p-4 border-2 border-dashed border-default-300 rounded-lg text-center">
            {importing ? (
              <div className="space-y-2">
                <Spinner size="lg" />
                <p className="text-sm text-gray-500">正在导入...</p>
              </div>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  color="primary"
                  variant="flat"
                  startContent={<HiUpload className="w-4 h-4" />}
                  onPress={handleImportClick}
                >
                  选择备份文件
                </Button>
                <p className="text-xs text-gray-400 mt-2">支持 .zip 或 .json 格式</p>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {/* 注意事项 */}
      <Card>
        <CardBody>
          <h4 className="font-medium mb-2">注意事项</h4>
          <ul className="text-sm text-gray-500 space-y-1 list-disc list-inside">
            <li>导出的备份文件包含敏感数据，请妥善保管</li>
            <li>导入备份会清空当前系统数据，请先确认备份文件正确</li>
            <li>导入会保留备份中的原始ID关系、平台账号、软件用户密码和代理关系</li>
            <li>备份文件使用兼容格式，可从 MySQL 导入到 PostgreSQL 验证站点</li>
            <li>导入完成后当前登录状态可能失效，需要重新登录</li>
            <li>建议定期备份重要数据</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}
