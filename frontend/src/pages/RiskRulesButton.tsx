import { Button, Modal, ModalBody, ModalContent, ModalHeader, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react'
import { useState } from 'react'

const rules = [
  ['近7天登录IP >= 5', '+25', '中等异常'],
  ['近7天登录IP >= 10', '+45', '明显共享或代理池'],
  ['绑定设备数超过特征数限制', '+30', '疑似超设备使用'],
  ['绑定设备数超过特征数限制2倍', '+50', '高概率共享账号'],
  ['在线会话数超过通道数', '+25', '疑似绕过通道限制'],
  ['在线会话数超过通道数2倍', '+45', '明显异常在线'],
  ['最近1小时登录 >= 10次', '+25', '高频登录'],
  ['最近1小时登录 >= 30次', '+45', '脚本或异常重连'],
  ['最近24小时解绑 >= 3次', '+30', '频繁换机'],
  ['最近24小时解绑 >= 8次', '+50', '高频换机'],
  ['绑定特征码命中黑名单', '+80', '直接高风险'],
]

export default function RiskRulesButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size={size} variant="flat" color="primary" onPress={() => setOpen(true)}>
        判定规则
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>风险用户判定规则</ModalHeader>
          <ModalBody className="pb-6 space-y-4">
            <div className="text-sm text-gray-500">
              系统按规则累加风险分数：20-49 为低风险，50-79 为中风险，80 分及以上为高风险。低于 20 分不会进入风险用户列表。
            </div>
            <Table aria-label="风险判定规则" removeWrapper>
              <TableHeader>
                <TableColumn>规则</TableColumn>
                <TableColumn>分值</TableColumn>
                <TableColumn>说明</TableColumn>
              </TableHeader>
              <TableBody>
                {rules.map(([rule, score, note]) => (
                  <TableRow key={rule}>
                    <TableCell>{rule}</TableCell>
                    <TableCell className="text-warning font-medium">{score}</TableCell>
                    <TableCell>{note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  )
}
