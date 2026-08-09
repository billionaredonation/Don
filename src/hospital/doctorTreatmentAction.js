import { state } from '../state.js';
import {
  getHospitalUserErrorMessage,
  loadMyHospitalEmployments,
  treatPlayerForPriceFromInteraction,
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
      <label><span>Цена лечения <small>можно 0</small></span><input type="number" min="0" max="1000000000" step="1" inputmode="numeric" value="0" data-heal-price></label>
      <button type="button" class="is-primary" data-heal-submit>Вылечить</button>
      <small>Таблетка применяется к другому игроку через подсистему врача и не попадает в его инвентарь. Любой доступный препарат можно применять при любом уровне HP пациента. Если не хватает еды, воды или денег, ничего не списывается.</small>
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
    const medicineType = medicineSelect.value;
    const price = Math.max(0, Math.floor(Number(priceInput.value || 0)));
    let successMessage = '';

    setBusy(true);

    try {
      const result = await treatPlayerForPriceFromInteraction({
        hospitalId: employment.hospitalId,
        target: target.target,
        medicineType,
        price,
      });

      await broadcastTo(result?.patientTgId, 'treatment_offer_created', {
        ...result,
        doctorNickname: result?.doctorNickname || state.nickname || 'Врач',
      });

      successMessage = `Предложение лечения отправлено игроку ${result?.patientNickname || target.nickname}. Таблетка и деньги будут списаны только после его подтверждения Y.`;
    } catch (error) {
      setMessage(getHospitalUserErrorMessage(error), 'error');
    } finally {
      setBusy(false);
      if (successMessage) setMessage(successMessage, 'success');
    }
  });
}

export const doctorTreatmentAction = Object.freeze({
  id: 'doctor_treatment',
  order: 10,
  accessCacheMs: 15_000,
  button: Object.freeze({
    icon: '✚',
    label: 'Вылечить',
    description: 'Подсистема врача',
  }),
  resolveAccess: resolveDoctorAccess,
  render: renderDoctorTreatment,
});
