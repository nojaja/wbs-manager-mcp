import { ArtifactTreeProvider} from '../views/explorer/artifactTree';
import { CommandHandler } from './CommandHandler';

/**
 * artifactTree.createArtifact のハンドラ
 * @returns 新規作成されたアーティファクト or undefined
 */
export class CreateArtifactHandler extends CommandHandler {
  async handle() {
    const artifactProvider = ArtifactTreeProvider.getInstance();
    return artifactProvider.createArtifact();
  }
}
