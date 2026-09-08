/**********************************************************************
 * Copyright (C) 2025 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import '@testing-library/jest-dom/vitest';

import type { Cluster, Context, User } from '@kubernetes/client-node';
import { Dropdown } from '@podman-desktop/ui-svelte';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { assert, beforeEach, describe, expect, test, vi } from 'vitest';

import EditModal from './EditModal.svelte';
import { RemoteMocks } from '/@/tests/remote-mocks';
import type { ContextsApi } from '@kubernetes-contexts/channels';
import { API_CONTEXTS } from '@kubernetes-contexts/channels';

vi.mock(import('@podman-desktop/ui-svelte'), async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    Dropdown: vi.fn() as unknown as typeof Dropdown,
  };
});

const mockUser1: User = {
  name: 'user-name',
};
const mockUser2: User = {
  name: 'user-name-2',
};

const mockCluster1: Cluster = {
  name: 'cluster-name',
  server: 'https://server-name',
  skipTLSVerify: true,
};
const mockCluster2: Cluster = {
  name: 'cluster-name-2',
  server: 'https://server-name-2',
  skipTLSVerify: false,
};

const mockContext1: Context = {
  name: 'context-name',
  cluster: 'cluster-name',
  namespace: 'context-namespace',
  user: 'user-name',
};
const closeCallback = (): void => {};

const remoteMocks = new RemoteMocks();

beforeEach(() => {
  vi.resetAllMocks();
  remoteMocks.reset();
  remoteMocks.mock(API_CONTEXTS, {
    editContext: vi.fn(),
  } as unknown as ContextsApi);
});

describe('UpdateContext', () => {
  test('Expect that modal has and save button displays', async () => {
    render(EditModal, {
      contexts: [],
      users: [],
      clusters: [],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    const contextNameEntry = screen.getByLabelText('Name');
    expect(contextNameEntry).toBeInTheDocument();
    const contextNamespaceEntry = screen.getByLabelText('Namespace');
    expect(contextNamespaceEntry).toBeInTheDocument();
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeInTheDocument();
  });

  test('Expect that save button is disabled by default', async () => {
    render(EditModal, {
      contexts: [],
      users: [],
      clusters: [],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  test('Expect that empty context name disables save button', async () => {
    render(EditModal, {
      contexts: [],
      users: [],
      clusters: [],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    const contextName = screen.getByLabelText('Name');
    await userEvent.click(contextName);
    await userEvent.paste('');

    expect(saveButton).toBeDisabled();
  });

  test('Expect that empty context namespace disables save button', async () => {
    render(EditModal, {
      contexts: [],
      users: [],
      clusters: [],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    const contextNamespace = screen.getByLabelText('Namespace');
    await userEvent.click(contextNamespace);
    await userEvent.paste('');

    expect(saveButton).toBeDisabled();
  });

  test('Expect that valid context name enables save button', async () => {
    render(EditModal, {
      contexts: [],
      users: [],
      clusters: [],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    const contextName = screen.getByLabelText('Name');
    await userEvent.click(contextName);
    await userEvent.paste('some-valid-name');

    expect(saveButton).toBeEnabled();
  });

  test('basic contexts should have inputs prefill', async () => {
    render(EditModal, {
      contexts: [],
      users: [],
      clusters: [],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    const contextName: HTMLInputElement = screen.getByRole('textbox', {
      name: 'contextName',
    });
    expect(contextName.value).toBe(mockContext1.name);

    const contextNamespace: HTMLInputElement = screen.getByRole('textbox', {
      name: 'contextNamespace',
    });
    expect(contextNamespace.value).toBe(mockContext1.namespace);
  });

  test('Expect error message if context name is cleared after it was initially prefilled', async () => {
    render(EditModal, {
      contexts: [],
      users: [],
      clusters: [],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    expect(screen.queryByText('Please enter a value')).not.toBeInTheDocument();

    const contextName = screen.getByLabelText('Name');
    expect((contextName as HTMLInputElement).value).toBe(mockContext1.name);

    await userEvent.clear(contextName);

    const field = await screen.findByText('Please enter a value');
    expect(field).toBeInTheDocument();
  });

  test('dropdown value should match users', async () => {
    render(EditModal, {
      contexts: [],
      users: [mockUser1, mockUser2],
      clusters: [],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    await waitFor(() => {
      expect(Dropdown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          options: [mockUser1, mockUser2].map(user => ({
            value: user.name,
            label: user.name,
          })),
        }),
      );
    });
  });

  test('dropdown value should match clusters', async () => {
    render(EditModal, {
      contexts: [],
      users: [],
      clusters: [mockCluster1, mockCluster2],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    await waitFor(() => {
      expect(Dropdown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          options: [mockCluster1, mockCluster2].map(cluster => ({
            value: cluster.name,
            label: cluster.name,
          })),
        }),
      );
    });
  });

  test('dropdown#onUserStateChange should update value', async () => {
    render(EditModal, {
      contexts: [],
      users: [],
      clusters: [],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    expect(Dropdown).toHaveBeenCalled();
    const [, { onChange }] = vi.mocked(Dropdown).mock.calls[0];

    const label = 'user-name';
    assert(label, 'user name label should be defined');

    expect(onChange).toBeDefined();
    onChange?.(label);

    // dropdown component should have been updated with user value
    await vi.waitFor(() => {
      expect(Dropdown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          value: label,
        }),
      );
    });
  });

  test('dropdown#onClusterStateChange should update value', async () => {
    render(EditModal, {
      contexts: [],
      users: [],
      clusters: [],
      contextToEdit: mockContext1,
      closeCallback: closeCallback,
    });

    expect(Dropdown).toHaveBeenCalled();
    const [, { onChange }] = vi.mocked(Dropdown).mock.calls[0];

    const label = 'cluster-name';
    assert(label, 'cluster name label should be defined');

    expect(onChange).toBeDefined();
    onChange?.(label);

    // dropdown component should have been updated with cluster value
    await vi.waitFor(() => {
      expect(Dropdown).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          value: label,
        }),
      );
    });
  });
});
