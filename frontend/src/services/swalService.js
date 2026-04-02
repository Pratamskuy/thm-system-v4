import Swal from 'sweetalert2';

const defaultOptions = {
  confirmButtonColor: '#3085d6',
  cancelButtonColor: '#d33',
  customClass: {
    popup: 'swal2-custom-popup',
  },
};

export const showSuccess = (text, title = 'Success') => {
  return Swal.fire({
    title,
    text,
    icon: 'success',
    ...defaultOptions,
  });
};

export const showError = (text, title = 'Error') => {
  return Swal.fire({
    title,
    text,
    icon: 'error',
    ...defaultOptions,
  });
};

export const showWarning = (text, title = 'Warning') => {
  return Swal.fire({
    title,
    text,
    icon: 'warning',
    ...defaultOptions,
  });
};

export const showInfo = (text, title = 'Info') => {
  return Swal.fire({
    title,
    text,
    icon: 'info',
    ...defaultOptions,
  });
};

export const showConfirm = async ({
  title = 'Are you sure?',
  text = '',
  confirmButtonText = 'Yes',
  cancelButtonText = 'No',
  icon = 'question',
} = {}) => {
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    ...defaultOptions,
  });
  return result.isConfirmed;
};

export const showPrompt = async ({
  title = 'Input required',
  text = '',
  inputLabel = '',
  inputPlaceholder = '',
  inputValue = '',
} = {}) => {
  const result = await Swal.fire({
    title,
    text,
    input: 'text',
    inputLabel,
    inputPlaceholder,
    inputValue,
    showCancelButton: true,
    confirmButtonText: 'Submit',
    cancelButtonText: 'Cancel',
    ...defaultOptions,
  });
  if (result.isConfirmed) {
    return result.value ?? '';
  }
  return null;
};

export const showReturnConditionDialog = async ({
  title = 'Confirm Return',
  text = 'Pilih status barang setelah dikembalikan',
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  defaultCondition = 'normal',
} = {}) => {
  const html = `
    <div class="swal2-return-form">
      <div class="swal2-form-row">
        <label for="return-condition">Kondisi Barang</label>
        <select id="return-condition" class="swal2-select">
          <option value="normal">Normal</option>
          <option value="ok">OK</option>
          <option value="not good">Not Good</option>
          <option value="broken">Broken</option>
        </select>
      </div>
      <div class="swal2-form-row">
        <label for="return-notes">Catatan (opsional)</label>
        <textarea id="return-notes" class="swal2-textarea" rows="4"></textarea>
      </div>
    </div>
  `;

  const result = await Swal.fire({
    title,
    text,
    html,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    didOpen: () => {
      const select = document.getElementById('return-condition');
      if (select) select.value = defaultCondition;
    },
    preConfirm: () => {
      const conditionElement = document.getElementById('return-condition');
      const notesElement = document.getElementById('return-notes');
      const item_condition = conditionElement?.value || '';
      const notes = notesElement?.value?.trim() || '';
      if (!item_condition) {
        Swal.showValidationMessage('Pilih kondisi barang');
        return false;
      }
      return { item_condition, notes };
    },
    ...defaultOptions,
  });

  if (result.isConfirmed) {
    return result.value;
  }
  return null;
};
