# Task Details画面 コンポーネント設計書

## 概要
Task Details画面を3ペイン構成で刷新する。
- 左ペイン: 先行タスク一覧 (dependees)
- 中央ペイン: タスク詳細 (複数パネル)
- 右ペイン: 後続タスク一覧 (dependents)

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│ App.vue (全体統合)                                               │
├───────────────┬─────────────────────────────┬───────────────────┤
│ 左ペイン      │ 中央ペイン                  │ 右ペイン          │
│               │                             │                   │
│ Dependees     │ TaskDetailMain.vue          │ Dependents        │
│ TaskList.vue  │ ┌─────────────────────────┐ │ TaskList.vue      │
│               │ │ TaskBasicInfoPanel.vue  │ │                   │
│ - Task 1      │ │ - タイトル              │ │ - Task 5          │
│ - Task 2      │ │ - 説明                  │ │ - Task 6          │
│ - Task 3      │ │ - 担当者                │ │                   │
│               │ │ - ステータス            │ │                   │
│               │ │ - 見積もり              │ │                   │
│               │ └─────────────────────────┘ │                   │
│               │ ┌─────────────────────────┐ │                   │
│               │ │ ArtifactsPanel.vue      │ │                   │
│               │ │ - 成果物1               │ │                   │
│               │ │ - 成果物2               │ │                   │
│               │ └─────────────────────────┘ │                   │
│               │ ┌─────────────────────────┐ │                   │
│               │ │CompletionConditions     │ │                   │
│               │ │Panel.vue                │ │                   │
│               │ │ - 条件1                 │ │                   │
│               │ │ - 条件2                 │ │                   │
│               │ └─────────────────────────┘ │                   │
└───────────────┴─────────────────────────────┴───────────────────┘
```

## データフロー

```
┌─────────────────────────────────────────┐
│ TaskDetailPanel.ts (TypeScript側)       │
│                                         │
│ loadTaskWithDependencies()              │
│ ├─ taskClient.getTask(taskId)          │
│ ├─ dependenciesClient                   │
│ │   .getDependees(taskId)              │
│ ├─ dependenciesClient                   │
│ │   .getDependents(taskId)             │
│ └─ artifactClient.listArtifacts()      │
│                                         │
│ ↓ postMessage                           │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ App.vue (Webview Vue側)                 │
│                                         │
│ data: {                                 │
│   task: Task,                           │
│   dependees: Task[],                    │
│   dependents: Task[],                   │
│   artifacts: Artifact[],                │
│   selectedTaskId: string                │
│ }                                       │
│                                         │
│ methods: {                              │
│   onSelectTask(taskId)                  │
│   onSaveTask(updates)                   │
│ }                                       │
└─────────────────────────────────────────┘
         │           │           │
         ▼           ▼           ▼
┌──────────┐  ┌─────────┐  ┌──────────┐
│Dependees │  │TaskDetail│  │Dependents│
│TaskList  │  │Main      │  │TaskList  │
└──────────┘  └─────────┘  └──────────┘
```

## コンポーネント詳細設計

### 1. App.vue (全体統合)

**責務:**
- 3ペインの配置とレイアウト管理
- TypeScript側から受け取ったデータの管理
- タスク選択時のイベント処理
- 保存処理の統括

**Props:** なし (ルートコンポーネント)

**Data:**
```typescript
{
  task: Task | null,              // 現在表示中のタスク
  dependees: Task[],              // 先行タスク一覧
  dependents: Task[],             // 後続タスク一覧
  artifacts: Artifact[],          // 全成果物リスト
  selectedTaskId: string | null,  // 現在選択中のタスクID
}
```

**Methods:**
```typescript
// 初期化: TypeScript側からのメッセージを受信
onMessage(event: MessageEvent): void

// タスク選択時の処理
onSelectTask(taskId: string): void

// タスク保存時の処理
onSaveTask(updates: Partial<Task>): void
```

**Events:** なし (ルートコンポーネント)

**子コンポーネント:**
- DependeesTaskList
- TaskDetailMain
- DependentsTaskList

---

### 2. DependeesTaskList.vue (左ペイン)

**責務:**
- 先行タスク一覧の表示
- タスク選択時のイベント発火
- 選択中タスクのハイライト表示

**Props:**
```typescript
{
  tasks: Task[],                  // 先行タスク一覧
  selectedTaskId: string | null,  // 現在選択中のタスクID
  currentTaskId: string | null,   // 中央ペインで表示中のタスクID
}
```

**Events:**
```typescript
// タスクをクリックした時
emit('select-task', taskId: string)
```

**Template構造:**
```vue
<div class="dependees-task-list">
  <h3>先行タスク (Dependees)</h3>
  <div v-if="tasks.length === 0" class="empty-state">
    先行タスクはありません
  </div>
  <ul v-else>
    <li 
      v-for="task in tasks" 
      :key="task.id"
      :class="{ 
        'selected': task.id === selectedTaskId,
        'current': task.id === currentTaskId 
      }"
      @click="onSelectTask(task.id)"
    >
      <div class="task-item">
        <span class="task-status" :class="task.status"></span>
        <span class="task-title">{{ task.title }}</span>
      </div>
    </li>
  </ul>
</div>
```

---

### 3. TaskDetailMain.vue (中央ペイン統合)

**責務:**
- 3つのパネルを統合して表示
- 子パネルからの変更イベントを集約
- 保存処理の統括

**Props:**
```typescript
{
  task: Task | null,              // 表示するタスク
  artifacts: Artifact[],          // 全成果物リスト
}
```

**Events:**
```typescript
// タスク更新時
emit('update-task', updates: Partial<Task>)
```

**Data:**
```typescript
{
  localTask: Task | null,  // ローカルで編集中のタスク状態
}
```

**Methods:**
```typescript
// 基本情報パネルからの更新
onUpdateBasicInfo(updates: Partial<Task>): void

// 成果物パネルからの更新
onUpdateArtifacts(artifacts: TaskArtifactAssignment[]): void

// 完了条件パネルからの更新
onUpdateCompletionConditions(conditions: TaskCompletionCondition[]): void

// 保存ボタン押下時
onSave(): void
```

**子コンポーネント:**
- TaskBasicInfoPanel
- ArtifactsPanel
- CompletionConditionsPanel

---

### 4. TaskBasicInfoPanel.vue (中央ペイン - パネル1)

**責務:**
- タスクの基本情報表示・編集
- タイトル、説明、担当者、ステータス、見積もり

**Props:**
```typescript
{
  task: Task | null,  // 表示するタスク
}
```

**Events:**
```typescript
// 基本情報が変更された時
emit('update', updates: Partial<Task>)
```

**Template構造:**
```vue
<div class="task-basic-info-panel">
  <h3>基本情報</h3>
  <div class="form-group">
    <label>タイトル</label>
    <input v-model="localTask.title" @change="onUpdate" />
  </div>
  <div class="form-group">
    <label>説明</label>
    <textarea v-model="localTask.description" @change="onUpdate" />
  </div>
  <div class="form-group">
    <label>担当者</label>
    <input v-model="localTask.assignee" @change="onUpdate" />
  </div>
  <div class="form-group">
    <label>ステータス</label>
    <select v-model="localTask.status" @change="onUpdate">
      <option value="pending">Pending</option>
      <option value="in-progress">In Progress</option>
      <option value="completed">Completed</option>
    </select>
  </div>
  <div class="form-group">
    <label>見積もり (時間)</label>
    <input type="number" v-model="localTask.estimate" @change="onUpdate" />
  </div>
</div>
```

---

### 5. ArtifactsPanel.vue (中央ペイン - パネル2)

**責務:**
- 成果物リストの表示・編集
- 成果物の追加・削除

**Props:**
```typescript
{
  deliverables: TaskArtifactAssignment[],  // タスクに紐づく成果物
  artifacts: Artifact[],                   // 全成果物リスト
}
```

**Events:**
```typescript
// 成果物リストが変更された時
emit('update', deliverables: TaskArtifactAssignment[])
```

**Template構造:**
```vue
<div class="artifacts-panel">
  <h3>成果物 (Artifacts)</h3>
  <div v-if="localArtifacts.length === 0" class="empty-state">
    成果物が設定されていません
  </div>
  <ul v-else>
    <li v-for="(item, index) in localArtifacts" :key="index">
      <span class="artifact-name">{{ getArtifactName(item.artifactId) }}</span>
      <button @click="removeArtifact(index)">削除</button>
    </li>
  </ul>
  <div class="add-artifact">
    <select v-model="selectedArtifactId">
      <option value="">成果物を選択...</option>
      <option v-for="artifact in availableArtifacts" :key="artifact.id" :value="artifact.id">
        {{ artifact.name }}
      </option>
    </select>
    <button @click="addArtifact" :disabled="!selectedArtifactId">追加</button>
  </div>
</div>
```

---

### 6. CompletionConditionsPanel.vue (中央ペイン - パネル3)

**責務:**
- 完了条件リストの表示・編集
- 条件の追加・削除

**Props:**
```typescript
{
  conditions: TaskCompletionCondition[],  // 完了条件リスト
}
```

**Events:**
```typescript
// 完了条件リストが変更された時
emit('update', conditions: TaskCompletionCondition[])
```

**Template構造:**
```vue
<div class="completion-conditions-panel">
  <h3>完了条件 (Completion Conditions)</h3>
  <div v-if="localConditions.length === 0" class="empty-state">
    完了条件が設定されていません
  </div>
  <ul v-else>
    <li v-for="(condition, index) in localConditions" :key="index">
      <input 
        v-model="condition.condition" 
        @change="onUpdate"
        placeholder="完了条件を入力..."
      />
      <button @click="removeCondition(index)">削除</button>
    </li>
  </ul>
  <button @click="addCondition">+ 条件を追加</button>
</div>
```

---

### 7. DependentsTaskList.vue (右ペイン)

**責務:**
- 後続タスク一覧の表示
- タスク選択時のイベント発火
- 選択中タスクのハイライト表示

**Props:**
```typescript
{
  tasks: Task[],                  // 後続タスク一覧
  selectedTaskId: string | null,  // 現在選択中のタスクID
  currentTaskId: string | null,   // 中央ペインで表示中のタスクID
}
```

**Events:**
```typescript
// タスクをクリックした時
emit('select-task', taskId: string)
```

**Template構造:**
```vue
<div class="dependents-task-list">
  <h3>後続タスク (Dependents)</h3>
  <div v-if="tasks.length === 0" class="empty-state">
    後続タスクはありません
  </div>
  <ul v-else>
    <li 
      v-for="task in tasks" 
      :key="task.id"
      :class="{ 
        'selected': task.id === selectedTaskId,
        'current': task.id === currentTaskId 
      }"
      @click="onSelectTask(task.id)"
    >
      <div class="task-item">
        <span class="task-status" :class="task.status"></span>
        <span class="task-title">{{ task.title }}</span>
      </div>
    </li>
  </ul>
</div>
```

---

## イベントフロー

### タスク選択時
```
DependeesTaskList.vue
  → emit('select-task', taskId)
    → App.vue.onSelectTask(taskId)
      → vscode.postMessage({ command: 'selectTask', taskId })
        → TaskDetailPanel.ts.onMessage()
          → loadTaskWithDependencies(taskId)
            → webview.postMessage({ task, dependees, dependents })
              → App.vue (データ更新)
```

### タスク保存時
```
TaskBasicInfoPanel.vue
  → emit('update', updates)
    → TaskDetailMain.vue.onUpdateBasicInfo(updates)
      → localTask更新
        → TaskDetailMain.vue.onSave()
          → emit('update-task', localTask)
            → App.vue.onSaveTask(localTask)
              → vscode.postMessage({ command: 'save', data: localTask })
                → TaskDetailPanel.ts.saveTask()
```

## TypeScript側の変更 (TaskDetailPanel.ts)

### 追加するメソッド:
```typescript
/**
 * タスクと依存関係を含めて読み込む
 */
private async loadTaskWithDependencies(taskId: string): Promise<void> {
  const task = await this.taskClient.getTask(taskId);
  const dependeeIds = await this.dependenciesClient.getDependees(taskId);
  const dependentIds = await this.dependenciesClient.getDependents(taskId);
  
  const dependees = await this.taskClient.getTasks(dependeeIds);
  const dependents = await this.taskClient.getTasks(dependentIds);
  const artifacts = await this.artifactClient.listArtifacts();
  
  this._panel.webview.postMessage({
    command: 'init',
    payload: { task, dependees, dependents, artifacts }
  });
}

/**
 * タスク選択時の処理
 */
private async selectTask(taskId: string): Promise<void> {
  await this.loadTaskWithDependencies(taskId);
}
```

### メッセージハンドラの追加:
```typescript
protected onMessage(message: any): void {
  switch (message.command) {
    case 'save':
      this.saveTask(message.data);
      return;
    case 'selectTask':
      this.selectTask(message.taskId);
      return;
  }
}
```

## スタイリング方針

### レイアウト
- 3ペイン: Flexboxで `display: flex`
- 左ペイン: 固定幅 `width: 250px`
- 中央ペイン: 可変幅 `flex: 1`
- 右ペイン: 固定幅 `width: 250px`

### 色・スタイル
- 選択中タスク: `background-color: #0078d4; color: white;`
- 現在表示中タスク: `border-left: 3px solid #0078d4;`
- ステータス表示: 丸いアイコンで色分け
  - pending: グレー
  - in-progress: 青
  - completed: 緑

## 実装順序

1. ✅ データ構造調査 (完了)
2. 🔄 コンポーネント設計 (本タスク)
3. ⬜ TaskDetailPanel.tsの依存関係取得機能追加
4. ⬜ 中央ペインのパネル実装
5. ⬜ 左右ペインのリスト実装
6. ⬜ App.vueの統合
7. ⬜ スタイリング
8. ⬜ テストと動作確認
9. ⬜ 旧コード削除

## 注意事項

- **依存関係の用語**: 
  - dependees = 先行タスク (このタスクが依存している)
  - dependents = 後続タスク (このタスクに依存している)
  
- **Vueコンポーネント間通信**: 
  - Props down, Events up パターンを厳守
  
- **TypeScript ⇔ Webview通信**: 
  - postMessage/onMessage経由
  - コマンドベースのメッセージング

- **保存処理**: 
  - 中央ペインの各パネルで編集 → TaskDetailMain.vueで集約 → App.vueで統合 → TypeScript側で保存
