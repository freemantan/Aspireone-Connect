# Aspire Hub parent class finder

Public page: https://connect.aspireone.ai/find-a-class/

Add a page named “Find Classes” to aspirehub.com. Paste the contents of
`deliverables/aspirehub-find-classes-embed.html` into a Custom HTML block and
publish the page. Add it to the website navigation. No API keys or Connect login
are needed. The iframe keeps requests on Connect's origin; no CORS change is needed.

Parents choose up to five physical branches OR one zone (all branches in that
zone), one academic level, and multiple/all subjects. Live online classes can
also be included. Results use the same renderer and product calendars as Connect.

Data comes from `/api/class-schedules`, backed by the existing Supabase
`ao_schedule_public_catalogue` function. It is read on every search, every 30
seconds while results are visible, and when the window regains focus. This is
polling, not instant database push. Only records eligible for the public
catalogue are displayed; unpublished/internal records stay private. If a read
fails, old results are cleared instead of being presented as current.

The existing public feed is verified operational; no database migration is needed.
Editing schedules stays in Connect. Changes to this parent page deploy via GitHub
and Cloudflare and appear inside the website embed automatically.
