import { state } from '../state.js';
import {
  getHospitalUserErrorMessage,
  issueMedicineFromInteraction,
  loadMyHospitalEmployments,
} from './hospitalWarehouseFeature.js';

function rankLevel(rank) {
  return ({ junior: 1, middle: 2, senior: 3, admin: 4 })[
    String(rank || '').toLowerCase()
  ] || 0;
}

async function resolveDoctorAccess() {
  const employments = await loadMyHospitalEmployments();

  if (!employments.length) return null;

  return {
    profession: 'doctor',
    employments,
  };
}

async function renderDoctorTreatment({
  access,
  target,
  content,
  setBusy,
  isBusy,
  setMessage,
  broadcastTo,
  isTargetActive,
}) {
  const employments = Array.isArray(access?.employments)
    ? access.employments
    : [];

  if (!employments.length || !target) {
    content.innerHTML = '<p>Доступ к подсистеме лечения не подтверждён.</p>';
    return;
  }

  content.innerHTML = `
    <div class="mn-player-action-form" data-doctor-treatment-form>
      <strong>Подсистема лечения</strong>
      <label><span>Больница</span><select data-heal-hospital>${employments.map((employment, index) => `<option value="${index}">${employment.displayName || 'Больница'}</option>`).join('')}</select></label>
      <label><span>Препарат</span><select data-heal-medicine></select></label>
      <label><span>Цена лечения <small>можно 0</small></span><input type="number" min="0" step="1" inputmode="numeric" value="0" data-heal-price></label>
      <button type="button" class="is-primary" data-heal-submit>Предложить лечение</button>
      <small>Доступ определяется профессией и рангом врача. Сервер повторно проверит должность, личные препараты и состояние пациента.</small>
    </div>`;

  const hospitalSelect = content.querySelector('[data-heal-hospital]');
  const medicineSelect = content.querySelector('[data-heal-medicine]');
  const priceInput = content.querySelector('[data-heal-price]');
  const submit = content.querySelector('[data-heal-submit]');

  const renderMedicines = () => {
    const employment = employments[Number(hospitalSelect.value || 0)] || employments[0];
    const level = rankLevel(employment.rank);
    const available = (employment.items || []).filter((item) =>
      Number(item.personalQuantity || 0) > 0 &&
      level >= Number(item.minTreatRank || 1)
    );

    medicineSelect.innerHTML = available.map((item) =>
      `<option value="${item.itemType}">${item.label} · ${Number(item.personalQuantity || 0)} шт.</option>`
    ).join('');
    submit.disabled = !available.length;

    if (!available.length) {
      setMessage('Нет доступных препаратов. Получите их со склада больницы.', 'error');
    } else {
      setMessage('');
    }
  };

  hospitalSelect.addEventListener('change', renderMedicines);
  renderMedicines();

  submit.addEventListener('click', async () => {
    if (
      isBusy() ||
      !medicineSelect.value ||
      !isTargetActive() ||
      !target.target
    ) return;

    const employment = employments[Number(hospitalSelect.value || 0)] || employments[0];
    const price = Math.max(0, Math.floor(Number(priceInput.value || 0)));

    setBusy(true);

    try {
      const result = await issueMedicineFromInteraction({
        hospitalId: employment.hospitalId,
        target: target.target,
        medicineType: medicineSelect.value,
        price,
      });

      await broadcastTo(result?.patientTgId, 'medicine_received', {
        medicineLabel: result?.medicineLabel,
        doctorNickname: state.nickname || 'Врач',
        price: result?.price || 0,
      });

      setMessage(
        `Лечение оформлено для ${result?.patientNickname || target.nickname}: ${result?.medicineLabel || 'препарат'}.`,
        'success'
      );
    } catch (error) {
      setMessage(getHospitalUserErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  });
}

export const doctorTreatmentAction = Object.freeze({
  id: 'doctor_treatment',
  order: 10,
  accessCacheMs: 15_000,
  button: Object.freeze({
    icon: '✚',
    label: 'Лечение',
    description: 'Подсистема врача',
  }),
  resolveAccess: resolveDoctorAccess,
  render: renderDoctorTreatment,
});
