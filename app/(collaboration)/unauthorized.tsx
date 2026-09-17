import Link from 'next/link'

export default function Unauthorized() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card-base max-w-md p-8 text-center">
        <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground">Fehler 401</p>
        <h1 className="mt-2 text-xl font-700">Nicht angemeldet</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Ihre Sitzung ist abgelaufen oder Sie sind nicht angemeldet.
        </p>
        <Link href="/collaboration/login" className="mt-6 inline-flex rounded-md bg-blue-700 px-4 py-2 text-sm font-600 text-white hover:bg-blue-800">Zur Anmeldung</Link>
      </div>
    </main>
  )
}
