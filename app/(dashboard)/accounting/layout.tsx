import { requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { AccountingNav } from '@/components/accounting/AccountingNav'

export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission(Resource.ACCOUNTING, Action.READ)
  return <div><AccountingNav />{children}</div>
}
