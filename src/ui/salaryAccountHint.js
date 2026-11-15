export function salaryAccountHint(value) {
  return /\b(?:BANK|AUTO)_SALARY_ACCOUNT_REQUIRED\b/.test(String(value ?? ''))
    ? 'У вас нет зарплатного счёта. Откройте зарплатный счёт в банке и попробуйте снова.' : null;
}
