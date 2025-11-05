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

import type { WebviewPanel, ExtensionContext } from '@podman-desktop/api';
import { env, Uri, window } from '@podman-desktop/api';

import { RpcExtension } from '@kubernetes-contexts/rpc';

import { readFile } from 'node:fs/promises';
import { ContextsManager } from '/@/manager/contexts-manager';
import { InversifyBinding } from '/@/inject/inversify-binding';
import type { Container } from 'inversify';
import { API_CONTEXTS, API_SUBSCRIBE, IDisposable } from '@kubernetes-contexts/channels';
import { ChannelSubscriber } from '/@/manager/channel-subscriber';
import { Dispatcher } from '/@/manager/dispatcher';

export class ContextsExtension {
  #container: Container | undefined;
  #inversifyBinding: InversifyBinding | undefined;

  #extensionContext: ExtensionContext;

  #contextsManager: ContextsManager;
  #channelSubscriber: ChannelSubscriber;
  #dispatcher: Dispatcher;

  constructor(readonly extensionContext: ExtensionContext) {
    this.#extensionContext = extensionContext;
  }

  async activate(): Promise<void> {
    const telemetryLogger = env.createTelemetryLogger();

    const panel = await this.createWebview();

    // Register webview communication for this webview
    const rpcExtension = new RpcExtension(panel.webview);
    rpcExtension.init();
    this.#extensionContext.subscriptions.push(rpcExtension);

    const now = performance.now();
    this.#inversifyBinding = new InversifyBinding(rpcExtension, this.extensionContext, telemetryLogger);
    this.#container = await this.#inversifyBinding.initBindings();

    this.#contextsManager = await this.#container.getAsync(ContextsManager);
    this.#channelSubscriber = await this.#container.getAsync(ChannelSubscriber);
    this.#dispatcher = await this.#container.getAsync(Dispatcher);
    this.#dispatcher.init();

    const afterFirst = performance.now();

    console.log('activation time:', afterFirst - now);

    rpcExtension.registerInstance(API_CONTEXTS, this.#contextsManager);
    rpcExtension.registerInstance(API_SUBSCRIBE, this.#channelSubscriber);

    const disposables = await this.#container.getAllAsync<IDisposable>(IDisposable);

    panel.onDidChangeViewState(event => {
      if (!event.webviewPanel.active) {
        for (const disposable of disposables) {
          disposable.dispose();
        }
      }
    });
  }

  async deactivate(): Promise<void> {
    console.log('deactivating Kubernetes Contexts extension');
  }

  private async createWebview(): Promise<WebviewPanel> {
    const panel = window.createWebviewPanel('kubernetes-contexts', 'Contexts', {
      localResourceRoots: [Uri.joinPath(this.#extensionContext.extensionUri, 'media')],
    });
    this.#extensionContext.subscriptions.push(panel);

    // Set the index.html file for the webview.
    const indexHtmlUri = Uri.joinPath(this.#extensionContext.extensionUri, 'media', 'index.html');
    const indexHtmlPath = indexHtmlUri.fsPath;

    let indexHtml = await readFile(indexHtmlPath, 'utf8');

    const scriptLink = indexHtml.match(/<script[^>]{0,50}src="([^"]+)"[^>]{0,50}>/g);
    if (scriptLink) {
      scriptLink.forEach(link => {
        const src = /src="(.*?)"/.exec(link);
        if (src) {
          const webviewSrc = panel.webview.asWebviewUri(
            Uri.joinPath(this.#extensionContext.extensionUri, 'media', src[1]),
          );
          indexHtml = indexHtml.replace(src[1], webviewSrc.toString());
        }
      });
    }

    const cssLink = indexHtml.match(/<link[^>]{0,50}href="([^"]+)"[^>]{0,50}>/g);
    if (cssLink) {
      cssLink.forEach(link => {
        const href = /href="(.*?)"/.exec(link);
        if (href) {
          const webviewHref = panel.webview.asWebviewUri(
            Uri.joinPath(this.#extensionContext.extensionUri, 'media', href[1]),
          );
          indexHtml = indexHtml.replace(href[1], webviewHref.toString());
        }
      });
    }

    // Update the webview panel with the new index.html file with corrected links.
    panel.webview.html = indexHtml;

    return panel;
  }
}
