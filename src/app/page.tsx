import { isAuthenticated, isPinEnabled } from '@/lib/auth';
import { getStorageMode } from '@/lib/storage';
import BookkeepingApp from '@/components/BookkeepingApp';
import PinLockScreen from '@/components/PinLockScreen';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const authed = await isAuthenticated();
  if (!authed) {
    return <PinLockScreen />;
  }

  return (
    <BookkeepingApp
      storageMode={getStorageMode()}
      pinEnabled={isPinEnabled()}
    />
  );
}
