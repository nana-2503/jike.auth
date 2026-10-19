import { useState, useEffect } from 'react'
import { Card, CardBody, Input, Button, Switch, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@heroui/react'
import { adminApi } from '../../api'
import { toast } from '../../components/Toast'
import { confirm } from '../../components/ConfirmModal'
import { HiPlus, HiTrash } from 'react-icons/hi'

interface CheckinConfig {
  min_reward: number
  max_reward: number
  enabled: number
}

interface StreakReward {
  id: number
  streak_days: number
  extra_reward: number
}

export default function AdminCheckin() {
  const [config, setConfig] = useState<CheckinConfig>({
    min_reward: 3,
    max_reward: 8,
    enabled: 1,
  })
  const [streakRewards, setStreakRewards] = useState<StreakReward[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newStreakDays, setNewStreakDays] = useState('')
  const [newExtraReward, setNewExtraReward] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res: any = await adminApi.getCheckinConfig()
      if (res.data) {
        setConfig(res.data.config || { min_reward: 3, max_reward: 8, enabled: 1 })
        setStreakRewards(res.data.streak_rewards || [])
      }
    } catch (e: any) {
      toast.error(e.message || '获取配置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminApi.saveCheckinConfig(config)
      toast.success('保存成功')
    } catch (e: any) {
      toast.error(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleAddStreak = async () => {
    const days = parseInt(newStreakDays)
    const reward = parseFloat(newExtraReward)
    if (!days || days <= 0) {
      toast.error('请输入有效的连续天数')
      return
    }
    if (isNaN(reward) || reward < 0) {
      toast.error('请输入有效的额外奖励')
      return
    }

    setAdding(true)
    try {
      const res: any = await adminApi.addStreakReward({ streak_days: days, extra_reward: reward })
      setStreakRewards([...streakRewards, res.data].sort((a, b) => a.streak_days - b.streak_days))
      setNewStreakDays('')
      setNewExtraReward('')
      toast.success('添加成功')
    } catch (e: any) {
      toast.error(e.message || '添加失败')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteStreak = async (id: number) => {
    if (!await confirm('确定要删除这条规则吗？')) return
    try {
      await adminApi.deleteStreakReward(id)
      setStreakRewards(streakRewards.filter(r => r.id !== id))
      toast.success('删除成功')
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12">加载中...</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">启用签到功能</h3>
              <p className="text-sm text-gray-500">关闭后用户将无法签到</p>
            </div>
            <Switch
              isSelected={config.enabled === 1}
              onValueChange={(v) => setConfig({ ...config, enabled: v ? 1 : 0 })}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h3 className="font-medium">基础奖励设置</h3>
          <p className="text-sm text-gray-500">每日签到随机获得的余额范围</p>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="最小奖励"
              type="number"
              step="0.1"
              value={String(config.min_reward)}
              onChange={(e) => setConfig({ ...config, min_reward: parseFloat(e.target.value) || 0 })}
            />
            <Input
              label="最大奖励"
              type="number"
              step="0.1"
              value={String(config.max_reward)}
              onChange={(e) => setConfig({ ...config, max_reward: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <Button color="primary" onPress={handleSave} isLoading={saving}>
            保存配置
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h3 className="font-medium">连续签到奖励</h3>
          <div className="flex gap-2 items-end">
            <Input
              label="连续天数"
              placeholder="如: 3"
              type="number"
              value={newStreakDays}
              onChange={(e) => setNewStreakDays(e.target.value)}
              className="w-40"
            />
            <Input
              label="额外奖励余额"
              placeholder="如: 5"
              type="number"
              step="0.1"
              value={newExtraReward}
              onChange={(e) => setNewExtraReward(e.target.value)}
              className="w-40"
            />
            <Button color="primary" isIconOnly onPress={handleAddStreak} isLoading={adding}>
              <HiPlus className="w-5 h-5" />
            </Button>
          </div>

          <Table aria-label="连续签到奖励规则">
            <TableHeader>
              <TableColumn>连续天数</TableColumn>
              <TableColumn>额外奖励</TableColumn>
              <TableColumn width={80}>操作</TableColumn>
            </TableHeader>
            <TableBody emptyContent="暂无规则">
              {streakRewards.map((reward) => (
                <TableRow key={reward.id}>
                  <TableCell>连续{reward.streak_days}天</TableCell>
                  <TableCell>+{reward.extra_reward}</TableCell>
                  <TableCell>
                    <Button
                      isIconOnly
                      size="sm"
                      color="danger"
                      variant="flat"
                      onPress={() => handleDeleteStreak(reward.id)}
                    >
                      <HiTrash className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  )
}
