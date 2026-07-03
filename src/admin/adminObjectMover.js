import { updateMapObject } from '../mapObjects/mapObjectsRepository.js';
import { renderMapObjects } from '../mapObjects/mapObjectsRenderer.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function createAdminObjectMover({
  root,
  panel,
  cityId,
  objectsLayer,
  getObjects,
  setObjects,
  getSelectedObjectId,
  setSelectedObjectId,
  reloadObjects,
  renderObjectList,
  canShowPanel,
}) {
  let moveMode = false;
  let moveSnapshot = null;
  let activeMoveObjectId = null;

  function getObjectById(objectId) {
    if (!objectId) return null;
    return getObjects().find((object) => String(object.id) === String(objectId)) || null;
  }

  function getActiveMoveObject() {
    return getObjectById(activeMoveObjectId || getSelectedObjectId());
  }

  function markSelectedObject() {
    const selectedObjectId = getSelectedObjectId();

    const nextObjects = getObjects().map((object) => ({
      ...object,
      selected: Boolean(selectedObjectId) && String(object.id) === String(selectedObjectId),
    }));

    setObjects(nextObjects);

    if (objectsLayer) {
      objectsLayer.hidden = false;
      objectsLayer.style.display = 'block';
    }

    renderMapObjects(objectsLayer, nextObjects);
    renderObjectList?.();
  }

  function setMoveMode(next) {
    moveMode = Boolean(next);
    root.dataset.adminMoveMode = moveMode ? 'enabled' : 'disabled';

    if (moveMode) {
      panel.hidden = true;
      return;
    }

    activeMoveObjectId = null;

    if (canShowPanel?.() !== false) {
      panel.hidden = false;
    }
  }

  function isMoveMode() {
    return moveMode;
  }

  function resetMoveMode() {
    activeMoveObjectId = null;
    moveSnapshot = null;
    setMoveMode(false);
  }

  function startMoveSelected() {
    const object = getObjectById(getSelectedObjectId());
    if (!object) return;

    activeMoveObjectId = String(object.id);
    setSelectedObjectId(String(object.id));

    moveSnapshot = {
      id: String(object.id),
      x: object.x,
      y: object.y,
    };

    markSelectedObject();
    setMoveMode(true);
  }

  async function saveMoveMode() {
    const object = getActiveMoveObject();
    if (!object) return;

    setSelectedObjectId(String(object.id));

    await updateMapObject(cityId, object.id, {
      x: round(object.x),
      y: round(object.y),
    });

    setMoveMode(false);
    moveSnapshot = null;
    await reloadObjects();
  }

  function cancelMoveMode() {
    const object = getActiveMoveObject();

    if (object && moveSnapshot) {
      setSelectedObjectId(String(object.id));

      const nextObjects = getObjects().map((item) => {
        if (String(item.id) !== String(object.id)) return item;

        return {
          ...item,
          x: moveSnapshot.x,
          y: moveSnapshot.y,
        };
      });

      setObjects(nextObjects);
      markSelectedObject();
    }

    setMoveMode(false);
    moveSnapshot = null;
  }

  function moveSelectedVisual(dx, dy) {
    const object = getActiveMoveObject();
    if (!object) return;

    const nextObjects = getObjects().map((item) => {
      if (String(item.id) !== String(object.id)) return item;

      return {
        ...item,
        x: round(clamp(Number(item.x) + dx, 0, 100)),
        y: round(clamp(Number(item.y) + dy, 0, 100)),
      };
    });

    setObjects(nextObjects);
    setSelectedObjectId(String(object.id));

    if (objectsLayer) {
      objectsLayer.hidden = false;
      objectsLayer.style.display = 'block';
    }

    renderMapObjects(objectsLayer, nextObjects);
    renderObjectList?.();
  }

  function cleanup() {
    delete root.dataset.adminMoveMode;
  }

  return {
    isMoveMode,
    setMoveMode,
    startMoveSelected,
    saveMoveMode,
    cancelMoveMode,
    moveSelectedVisual,
    resetMoveMode,
    cleanup,
  };
}
