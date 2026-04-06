export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Flare API</h1>
      <p>Backend is running.</p>
      <h2>Endpoints</h2>
      <ul>
        <li>POST /api/auth/dev — get a dev token</li>
        <li>POST /api/auth/google — authenticate with Google</li>
        <li>GET /api/users/me — current user</li>
        <li>PUT /api/users/me — update profile</li>
        <li>GET /api/flares?lat=&amp;lng=&amp;radius_km= — nearby flares</li>
        <li>POST /api/flares — create a flare</li>
        <li>GET /api/flares/mine — my flares</li>
        <li>GET /api/flares/:id — flare detail</li>
        <li>PATCH /api/flares/:id — cancel flare</li>
        <li>POST /api/flares/:id/join — join a flare</li>
        <li>GET /api/flares/:id/requests — pending requests</li>
        <li>GET /api/flares/:id/share — share link</li>
        <li>GET /api/matches — my matches</li>
        <li>PATCH /api/matches/:id — accept/pass</li>
        <li>GET /api/matches/:id/messages — chat messages</li>
        <li>POST /api/matches/:id/messages — send message</li>
      </ul>
    </main>
  );
}
