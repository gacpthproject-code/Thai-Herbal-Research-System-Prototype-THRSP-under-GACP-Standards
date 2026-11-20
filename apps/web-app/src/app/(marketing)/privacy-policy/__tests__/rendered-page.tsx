import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPolicyPage from '../page';

export function renderPage(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(<PrivacyPolicyPage />);
  return root;
}

export function itemsOf(root: HTMLElement, sectionId: string): string[] {
  return Array.from(root.querySelectorAll(`#${sectionId} li`), (li) => li.textContent ?? '');
}

export function because(reason: string, check: () => void): void {
  try {
    check();
  } catch (err) {
    if (err instanceof Error) err.message = `${reason}\n\n${err.message}`;
    throw err;
  }
}
