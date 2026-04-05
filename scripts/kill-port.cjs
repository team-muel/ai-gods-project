const { execSync } = require('child_process')

try {
  // 3000, 3001 포트 점유 프로세스 종료
  const ports = [3000, 3001]
  for (const port of ports) {
    try {
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
      const lines = result.trim().split('\n')
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && /^\d+$/.test(pid) && pid !== '0') {
          try {
            execSync(`taskkill //F //PID ${pid}`, { stdio: 'ignore' })
            console.log(`✅ 포트 ${port} 해제 (PID ${pid})`)
          } catch {}
        }
      }
    } catch {}
  }
} catch {}
