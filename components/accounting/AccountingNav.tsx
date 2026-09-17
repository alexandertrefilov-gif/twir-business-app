import Link from 'next/link'

const links = [
  { href: '/accounting', label: 'Übersicht' },
  { href: '/accounting/income', label: 'Einnahmen' },
  { href: '/accounting/payments', label: 'Zahlungseingänge' },
  { href: '/accounting/open-items', label: 'Offene Posten' },
]

export function AccountingNav() {
  return (
    <nav aria-label="Buchhaltung" className="flex flex-wrap gap-2 border-b border-stone-200 bg-white px-6 py-3">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-500 text-stone-700 hover:border-blue-300 hover:text-blue-700">
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
