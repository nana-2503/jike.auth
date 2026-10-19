import { Card, CardBody, CardHeader } from '@heroui/react'
import { HiBadgeCheck, HiInformationCircle, HiUsers } from 'react-icons/hi'

export default function AdminLicenseStatus() {
  return (
    <div className="space-y-4">
      <Card className="border border-gray-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-content1">
        <CardHeader className="border-b border-gray-200/80 bg-gray-50/80 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <HiBadgeCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">免费说明与免责声明</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">本系统为免费使用项目，使用前请仔细阅读以下说明</p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-6 p-5">
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <HiInformationCircle className="h-5 w-5 text-primary" />
              免费说明
            </h3>
            <div className="rounded-lg border border-gray-200/80 bg-gray-50/50 p-4 text-sm leading-6 text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
              <p className="mb-2">1. 本系统可免费下载和使用，不收取任何使用费用。</p>
              <p className="mb-2">2. 本项目不提供任何形式的商业授权。</p>
              <p className="mb-2">3. 您可以自由地将本系统用于个人学习、企业内部使用或商业部署。</p>
              <p>4. 如果您在使用的过程中遇到问题，欢迎加入我们的交流群获取帮助。</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <HiInformationCircle className="h-5 w-5 text-amber-500" />
              免责声明
            </h3>
            <div className="rounded-lg border border-gray-200/80 bg-gray-50/50 p-4 text-sm leading-6 text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
              <p className="mb-2">1. 本系统按"原样"提供，开发者不提供任何形式的明示或暗示担保，包括但不限于：系统完整性、稳定性、准确性、适用性、无侵权、无病毒、无漏洞、兼容性、性能、结果有效性、特定用途适用性等。开发者对系统质量、性能、适用性不做任何承诺。</p>
              <p className="mb-2">2. 使用者明确知悉并同意，使用本系统所产生的任何及所有风险，包括但不限于：数据丢失、数据泄露、服务中断、利润损失、业务中断、设备损坏、知识产权纠纷、第三方索赔、行政处罚等，均由使用者自行承担。开发者概不负责，且不承担任何赔偿义务。</p>
              <p className="mb-2">3. 在任何情况下，开发者均不对任何直接损失、间接损失、附带损失、特殊损失、惩罚性损失或后果性损失承担赔偿责任，包括但不限于利润损失、商誉损失、数据损失、业务中断、合同损失等，无论该等损失是否可预见，也无论该等损失是否由开发者或其授权方预先告知存在此类损失的可能性。</p>
              <p className="mb-2">4. 使用者应自行评估并承担使用本系统的全部风险。使用者应自行负责对其使用本系统前的数据备份、安全防护、合规审查及必要的测试。开发者不对使用者的任何操作行为及其后果负责。</p>
              <p className="mb-2">5. 使用者应遵守所在国家/地区的法律法规，不得利用本系统从事任何违法、侵权或不当活动。如因使用者违反法律法规或本声明而导致任何法律责任或损失，均由使用者自行承担，开发者概不负责。</p>
              <p className="mb-2">6. 开发者保留随时修改、更新、中断或终止本项目的全部或部分功能的权利，无需事先通知，亦不承担任何责任。开发者不保证系统持续可用、无错误、安全或无病毒。</p>
              <p className="mb-2">7. 本系统可能包含指向第三方网站、服务或资源的链接或集成。开发者对第三方内容、服务或资源的合法性、准确性、完整性、安全性不做任何保证，亦不承担任何责任。使用者与第三方之间的任何纠纷，均由使用者自行解决，与开发者无关。</p>
              <p className="mb-2">8. 如本系统与任何第三方软件、硬件或服务集成使用，开发者不对该等第三方组件做任何保证，亦不对因集成使用而产生的任何问题或损失承担责任。</p>
              <p className="mb-2">9. 本声明构成使用者与开发者之间关于本系统使用的完整协议，取代任何先前的口头或书面协议。如本声明任何条款被认定为无效或不可执行，不影响其余条款的效力。</p>
              <p>10. 本声明可能随时更新，恕不另行通知。使用者继续使用本系统即视为接受更新后的声明。最新版本以系统内展示为准。</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <HiUsers className="h-5 w-5 text-emerald-500" />
              交流与支持
            </h3>
            <div className="rounded-lg border border-gray-200/80 bg-gray-50/50 p-4 text-sm leading-6 text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
              <p className="mb-2">如果您在使用过程中遇到问题，或有功能建议，欢迎在 GitHub 提交 Issue 或参与 Discussions：</p>
              <a
                href="https://github.com/nana-2503/jike-auth/issues"
                target="_blank"
                rel="noreferrer"
                className="text-base font-semibold text-primary hover:underline"
              >
                GitHub Issues
              </a>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">社区提供问题解答、版本更新通知及二次开发交流。</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <HiBadgeCheck className="h-5 w-5 text-violet-500" />
              版权信息
            </h3>
            <div className="rounded-lg border border-gray-200/80 bg-gray-50/50 p-4 text-sm leading-6 text-gray-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
              <p className="mb-2">Copyright (c) 2024-2026 jike-auth contributors.</p>
              <p className="mb-2">本项目基于 MIT 许可证开源，详见仓库根目录的 LICENSE 文件。</p>
              <p>你可以自由地使用、修改、分发本项目，包括用于商业目的。</p>
            </div>
          </section>
        </CardBody>
      </Card>
    </div>
  )
}
