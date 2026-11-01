# Connexió d'agents al MCP del Zerto Virtual Manager

## Arquitectura del servei

El MCP del ZVM s'exposa com a servei HTTP/SSE en aquesta màquina Windows (`10.20.0.106`) mitjançant dos serveis Windows:

```
ZvmMcpServer (stdio)
    └─► ZvmMcpGateway  [supergateway via NSSM]
              └─► HTTP/SSE  →  0.0.0.0:8080
```

| Servei Windows | Executable | Rol |
|---|---|---|
| `ZvmMcpServer` | `C:\zerto_mcp\ZvmMcpServerService.exe` | MCP server natiu (stdio) |
| `ZvmMcpGateway` | `node supergateway --stdio ZvmMcpServer.exe --port 8080` | Proxy stdio → HTTP/SSE |

## Endpoint

```
http://10.20.0.106:8080/sse
```

Les VMs de l'entorn (`10.20.0.146–149`) estan a la mateixa subxarxa i poden arribar-hi directament sense configuració addicional de xarxa.

---

## Configuració per tipus d'agent

### Claude Code CLI

```bash
claude --mcp-server "zerto:http://10.20.0.106:8080/sse"
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "Zerto Virtual Manager MCP": {
      "url": "http://10.20.0.106:8080/sse",
      "transport": "sse"
    }
  }
}
```

### Agent Python (Anthropic SDK)

```python
import anthropic

client = anthropic.Anthropic()

response = client.beta.messages.create(
    model="claude-opus-4-5",
    max_tokens=4096,
    tools=[],                      # eines pròpies de l'agent
    mcp_servers=[
        {
            "url": "http://10.20.0.106:8080/sse",
            "transport": "sse",
            "name": "Zerto Virtual Manager MCP"
        }
    ],
    messages=[{"role": "user", "content": "..."}]
)
```

### Agent Node.js / TypeScript (Anthropic SDK)

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.beta.messages.create({
  model: "claude-opus-4-5",
  max_tokens: 4096,
  mcp_servers: [
    {
      url: "http://10.20.0.106:8080/sse",
      transport: "sse",
      name: "Zerto Virtual Manager MCP",
    },
  ],
  messages: [{ role: "user", content: "..." }],
});
```

---

## Eines disponibles

Un cop connectat, l'agent té accés a totes les eines del ZVM. Les més rellevants per a monitorització de resiliència:

| Eina | Descripció |
|---|---|
| `GetVpgs` | Llista tots els VPGs i el seu estat |
| `GetVpgDetails` | Detalls d'un VPG específic (RPO, journal, estat) |
| `GetAlerts` | Alertes actives del ZVM |
| `GetEvents` | Historial d'events (failovers, tests, errors) |
| `GetProtectedVms` | VMs protegides i el seu estat de replicació |
| `GetTasks` | Tasques en curs (failover tests, etc.) |
| `StartVpgFailoverTest` | Inicia un Failover Test sobre un VPG |
| `StopVpgFailoverTest` | Atura el Failover Test i fa rollback |

---

## Estat del servei

Per verificar que el gateway està operatiu:

```bash
# Des de qualsevol VM de l'entorn
curl http://10.20.0.106:8080/sse
```

Per gestionar el servei des de la màquina Windows:

```powershell
# Estat
Get-Service ZvmMcpGateway, ZvmMcpServer | Select-Object Name, Status

# Reiniciar
Restart-Service ZvmMcpGateway
Restart-Service ZvmMcpServer
```
