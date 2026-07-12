# Repository Sensitive Data Remediation

Phase 2D removes current-head hard-coded administrator identities and name/phone escalation from Worker and frontend sources. The scan checks tracked files without printing secret values.

Do not rewrite Git history in this phase. If prior commits exposed a replaceable secret, rotate it first, then separately decide whether private-repository access controls or a history rewrite are justified. Public LIFF IDs and public endpoints are documented configuration, not secrets.