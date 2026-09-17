import Link from 'next/link'

export default function Forbidden() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card-base max-w-md p-8 text-center">
        <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground">Fehler 403</p>
        <h1 className="mt-2 text-xl font-700">Kein Zugriff</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sie sind angemeldet, haben für diesen Bereich aber keine Berechtigung.
          Wenn Sie hier Zugriff benötigen, wenden Sie sich an Ihre Administratorin
          oder Ihren Administrator.
        </p>
        <Link href="/intern/dashboard" className="mt-6 inline-flex rounded-md bg-blue-700 px-4 py-2 text-sm font-600 text-white hover:bg-blue-800">Zum Dashboard</Link>
      </div>
    </main>
  )
}
